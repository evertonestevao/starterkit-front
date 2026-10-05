import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { RateLimiter } from "@/server/rateLimit";
import type { CompanyInvite, CompanyMember } from "@/types/database";
import type { MyPendingInvite } from "@/types/tenant";
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
  /** Convites pendentes PARA o usuário logado (RPC my_pending_invites). */
  listMyPending(): Promise<MyPendingInvite[]>;
  /** Chama a RPC accept_company_invite; erros de negócio viram AppError. */
  acceptInvite(token: string): Promise<CompanyMember>;
}

/** Porta para o passo de email — implementada pelo emailService. */
export interface InviteNotifier {
  sendInviteEmail(invite: CompanyInvite): Promise<void>;
}

/** Link de aceite de um convite (o mesmo que vai no e-mail). */
export function linkDeAceite(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/invites/accept?token=${token}`;
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

    // Auditoria antes do e-mail: o convite já existe, saia o e-mail ou não.
    await audit?.record({
      companyId,
      userId: invitedBy,
      action: "member.invited",
      entityType: "company_invite",
      entityId: created.id,
      metadata: { role },
    });
    await enviarEmail(created);

    return created;
  }

  /**
   * O convite vale mesmo sem o e-mail: quem convidou pode reenviar ou mandar
   * o link pelo WhatsApp. Por isso a falha do provedor vira uma mensagem que
   * diz o que fazer, em vez de um erro genérico.
   */
  async function enviarEmail(convite: CompanyInvite): Promise<void> {
    try {
      await notifier?.sendInviteEmail(convite);
    } catch (err) {
      throw new AppError(
        "email_error",
        "O convite foi criado, mas o e-mail não saiu. Na ficha do membro, use \"Reenviar e-mail\" ou \"Copiar link\" para mandar pelo WhatsApp.",
        err,
      );
    }
  }

  async function pendente(inviteId: string, companyId: string): Promise<CompanyInvite> {
    if (!z.uuid().safeParse(inviteId).success) throw new AppError("validation_error", "Convite inválido");
    const convite = (await repo.listPending(companyId)).find((c) => c.id === inviteId);
    if (!convite) throw new AppError("not_found", "Convite pendente não encontrado. Ele pode ter sido aceito ou cancelado.");
    return convite;
  }

  /** Manda de novo o e-mail de um convite pendente (mesmo limite de quem convida). */
  async function resend(inviteId: string, companyId: string, resentBy: string): Promise<CompanyInvite> {
    const convite = await pendente(inviteId, companyId);
    await rateLimiter.consume(`invite:${companyId}:${resentBy}`);
    await audit?.record({
      companyId,
      userId: resentBy,
      action: "invite.resent",
      entityType: "company_invite",
      entityId: convite.id,
    });
    await enviarEmail(convite);
    return convite;
  }

  /**
   * O token de um convite pendente, para montar o link e mandar por outro
   * canal (WhatsApp). Só chega aqui quem a RLS deixa ler os convites da
   * empresa — quem administra, que poderia convidar a mesma pessoa de novo.
   */
  async function tokenDoConvite(inviteId: string, companyId: string): Promise<{ token: string; email: string }> {
    const convite = await pendente(inviteId, companyId);
    return { token: convite.token, email: convite.email };
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

  /** Convites endereçados a mim (para exibir aviso/badge nas configurações). */
  async function listMyPending(): Promise<MyPendingInvite[]> {
    return repo.listMyPending();
  }

  return { invite, revoke, resend, tokenDoConvite, accept, listPending, listMyPending };
}

export type InviteService = ReturnType<typeof createInviteService>;
