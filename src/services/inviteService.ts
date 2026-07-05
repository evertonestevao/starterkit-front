import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { RateLimiter } from "@/server/rateLimit";
import type { CompanyInvite, CompanyMember } from "@/types/database";
import type { AuditService } from "./auditService";

/**
 * Convites de membros (plano §5): owner/admin convida por email, convite
 * expira e pode ser revogado. O aceite passa pela RPC accept_company_invite
 * (security definer) porque quem aceita ainda não é membro da empresa.
 */

export interface InviteRepository {
  createInvite(data: {
    companyId: string;
    email: string;
    role: "admin" | "member";
    invitedBy: string;
  }): Promise<CompanyInvite>;
  revokeInvite(inviteId: string, companyId: string): Promise<void>;
  listPending(companyId: string): Promise<CompanyInvite[]>;
  /** Chama a RPC accept_company_invite; erros de negócio viram AppError. */
  acceptInvite(token: string): Promise<CompanyMember>;
}

/** Porta para o passo de email — implementada pelo emailService. */
export interface InviteNotifier {
  sendInviteEmail(invite: CompanyInvite): Promise<void>;
}

const createInviteSchema = z.object({
  companyId: z.uuid(),
  email: z.email(),
  // Owner não é convidável: só existe pela criação da empresa (ou
  // transferência explícita, fora do MVP).
  role: z.enum(["admin", "member"]),
  invitedBy: z.uuid(),
});

export type CreateInviteInput = z.input<typeof createInviteSchema>;

interface InviteServiceDeps {
  repo: InviteRepository;
  rateLimiter: RateLimiter;
  /** Opcionais até os passos seguintes ligarem tudo. */
  notifier?: InviteNotifier;
  audit?: AuditService;
}

export function createInviteService({ repo, rateLimiter, notifier, audit }: InviteServiceDeps) {
  async function invite(input: CreateInviteInput): Promise<CompanyInvite> {
    const parsed = createInviteSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError("validation_error", "Dados de convite inválidos", parsed.error);
    }
    const { companyId, email, role, invitedBy } = parsed.data;

    // Limite por quem convida dentro da empresa — não por email convidado,
    // senão um atacante testaria emails variados sem nunca ser limitado.
    await rateLimiter.consume(`invite:${companyId}:${invitedBy}`);

    const created = await repo.createInvite({
      companyId,
      email: email.toLowerCase(),
      role,
      invitedBy,
    });

    await notifier?.sendInviteEmail(created);
    await audit?.record({
      companyId,
      userId: invitedBy,
      action: "member.invited",
      entityType: "company_invite",
      entityId: created.id,
      metadata: { role },
    });

    return created;
  }

  async function revoke(inviteId: string, companyId: string, revokedBy: string): Promise<void> {
    await repo.revokeInvite(inviteId, companyId);
    await audit?.record({
      companyId,
      userId: revokedBy,
      action: "invite.revoked",
      entityType: "company_invite",
      entityId: inviteId,
    });
  }

  async function accept(token: string): Promise<CompanyMember> {
    const parsedToken = z.uuid().safeParse(token);
    if (!parsedToken.success) {
      throw new AppError("validation_error", "Token de convite inválido");
    }
    return repo.acceptInvite(parsedToken.data);
  }

  async function listPending(companyId: string): Promise<CompanyInvite[]> {
    return repo.listPending(companyId);
  }

  return { invite, revoke, accept, listPending };
}

export type InviteService = ReturnType<typeof createInviteService>;
