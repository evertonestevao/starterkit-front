import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getClientEnv } from "@/config/env";
import { createSupabaseDatabaseCheck } from "@/repositories/supabase/healthRepository";
import { createHealthService } from "@/services/healthService";

/** Health check sem sessão: client anon, sem cookies. */
export function getHealthService() {
  const env = getClientEnv();
  const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return createHealthService({
    checks: { database: createSupabaseDatabaseCheck(anonClient) },
    onFailure: (name, err) => console.error(`[health] checagem "${name}" falhou:`, err),
  });
}
