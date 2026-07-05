import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getClientEnv, requireServerEnv } from "@/config/env";

/**
 * Client Supabase com service_role — IGNORA RLS. Só pode existir em src/server
 * e route handlers (o import de "server-only" quebra o build se algum código
 * client tentar importar este arquivo).
 */

let adminClient: SupabaseClient | undefined;

export function getSupabaseAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      getClientEnv().NEXT_PUBLIC_SUPABASE_URL,
      requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return adminClient;
}
