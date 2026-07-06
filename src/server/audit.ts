import "server-only";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { createAuditService } from "@/services/auditService";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Registra um evento de auditoria em nome do usuário logado. Erro aqui
 * PROPAGA e desfaz a action — trilha de auditoria furada é pior que uma
 * operação recusada (mesma postura do inviteService).
 */
export async function recordAudit(entry: {
  companyId: string;
  /** Convenção entidade.verbo: member.role_changed, company.updated... */
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const client = await getSupabaseServerClient();
  const { data } = await client.auth.getUser();
  const audit = createAuditService(createSupabaseAuditRepository(client));
  await audit.record({
    companyId: entry.companyId,
    userId: data.user?.id ?? null,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
  });
}
