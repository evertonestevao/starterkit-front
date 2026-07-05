import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getClientEnv } from "@/config/env";

/**
 * Client Supabase com a chave anônima (RLS ativa). Único ponto de criação —
 * componentes nunca importam @supabase/supabase-js; o acesso passa por
 * hooks → services → repositories (ver CLAUDE.md).
 */

let browserClient: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    const env = getClientEnv();
    browserClient = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return browserClient;
}
