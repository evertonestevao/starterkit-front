import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { AuditLog } from "@/types/database";
import { normalizePageParams, type Paginated, type PageParams } from "./tenantService";

/**
 * Trilha de auditoria básica (plano §10): quem fez o quê, em qual empresa,
 * sobre qual entidade. Estrutura essencial, sem UI avançada no MVP.
 */

export interface AuditRepository {
  insert(entry: NewAuditEntry): Promise<void>;
  listByCompany(
    companyId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ items: AuditLog[]; total: number }>;
}

const auditEntrySchema = z.object({
  companyId: z.uuid(),
  /** null = evento de sistema (ex.: webhook), sem usuário logado. */
  userId: z.uuid().nullable(),
  /** Convenção "entidade.verbo": member.invited, subscription.canceled... */
  action: z.string().min(1).max(100),
  entityType: z.string().max(100).nullable().default(null),
  entityId: z.uuid().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type NewAuditEntry = z.infer<typeof auditEntrySchema>;
export type NewAuditEntryInput = z.input<typeof auditEntrySchema>;

/**
 * Chaves que nunca podem parar num log (CLAUDE.md: sem senha, token ou
 * payload de pagamento cru). Removidas recursivamente do metadata.
 */
const SENSITIVE_KEY_PATTERN =
  /(password|senha|token|secret|authorization|api[_-]?key|card|cvv|cvc)/i;

export function sanitizeMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    clean[key] =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? sanitizeMetadata(raw as Record<string, unknown>)
        : raw;
  }
  return clean;
}

export function createAuditService(repo: AuditRepository) {
  /** Registra uma ação. Valida com Zod e remove chaves sensíveis do metadata. */
  async function record(input: NewAuditEntryInput): Promise<void> {
    const parsed = auditEntrySchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError("validation_error", "Entrada de auditoria inválida", parsed.error);
    }
    await repo.insert({ ...parsed.data, metadata: sanitizeMetadata(parsed.data.metadata) });
  }

  /** Entradas da empresa, paginadas (a RLS já restringe a owner/admin). */
  async function listRecent(
    companyId: string,
    params?: PageParams,
  ): Promise<Paginated<AuditLog>> {
    const { page, pageSize, offset } = normalizePageParams(params, 20, 100);
    const { items, total } = await repo.listByCompany(companyId, { limit: pageSize, offset });
    return { items, total, page, pageSize };
  }

  return { record, listRecent };
}

export type AuditService = ReturnType<typeof createAuditService>;
