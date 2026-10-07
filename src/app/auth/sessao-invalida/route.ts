import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/server/supabase-server";

/**
 * Saída de uma sessão que não vale mais (conta excluída, token revogado).
 *
 * Só desloga se o servidor do Supabase confirmar que a sessão é inválida:
 * com sessão boa, só volta ao painel. Assim um link para cá, mandado por
 * outra pessoa, não consegue deslogar ninguém (é GET de propósito, para as
 * páginas do servidor poderem redirecionar para cá).
 *
 * Route handler, e não página, porque só aqui dá para apagar os cookies.
 */
export async function GET(request: NextRequest) {
  const client = await getSupabaseServerClient();
  const { data } = await client.auth.getUser();

  if (data.user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // signOut com usuário inexistente devolve erro do servidor, mas a sessão
  // local (cookies) é removida mesmo assim.
  await client.auth.signOut().catch(() => undefined);
  const url = new URL("/login", request.url);
  url.searchParams.set("motivo", "sessao");
  return NextResponse.redirect(url);
}
