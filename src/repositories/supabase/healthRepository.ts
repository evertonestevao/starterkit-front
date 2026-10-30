import type { SupabaseClient } from "@supabase/supabase-js";
import type { HealthCheck } from "@/services/healthService";

/**
 * Banco respondendo: lê terms_versions, a única tabela com SELECT liberado
 * para anon (catálogo público). Não toca em dado de tenant.
 */
export function createSupabaseDatabaseCheck(client: SupabaseClient): HealthCheck {
  return async () => {
    const { error } = await client
      .from("terms_versions")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
  };
}
