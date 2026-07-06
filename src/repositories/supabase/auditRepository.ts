import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { AuditRepository } from "@/services/auditService";
import type { AuditLog } from "@/types/database";

/**
 * Implementação Supabase do AuditRepository. Client vem de fora: anon para
 * ações do usuário logado (a RLS exige user_id = auth.uid()), service_role
 * para eventos de sistema (webhooks) gravados no servidor.
 */
export function createSupabaseAuditRepository(client: SupabaseClient): AuditRepository {
  return {
    async insert(entry) {
      const { error } = await client.from("audit_logs").insert({
        company_id: entry.companyId,
        user_id: entry.userId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        metadata: entry.metadata,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao registrar auditoria", error);
      }
    },

    async listByCompany(companyId, { limit, offset }) {
      const { data, error, count } = await client
        .from("audit_logs")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) {
        throw new AppError("internal_error", "Falha ao listar auditoria", error);
      }
      return { items: (data ?? []) as AuditLog[], total: count ?? 0 };
    },
  };
}
