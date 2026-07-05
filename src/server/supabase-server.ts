import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getClientEnv } from "@/config/env";

/**
 * Client Supabase para Server Components, Server Actions e Route Handlers.
 * Usa a chave ANÔNIMA (RLS ativa) com a sessão do usuário vinda dos cookies —
 * não confundir com o client service_role em supabase-admin.ts.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = getClientEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components não podem escrever cookies; o refresh da
            // sessão acontece no proxy.ts, então ignorar aqui é seguro.
          }
        },
      },
    },
  );
}
