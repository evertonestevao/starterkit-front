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

    async listByCompany(companyId, limit) {
      const { data, error } = await client
        .from("audit_logs")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new AppError("internal_error", "Falha ao listar auditoria", error);
      }
      return (data ?? []) as AuditLog[];
    },
  };
}
