import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getClientEnv } from "@/config/env";

/**
 * Proxy (o "middleware" do Next 16): mantém a sessão Supabase renovada nos
 * cookies e faz a checagem OTIMISTA de auth para redirecionar cedo. A
 * autorização real (membership, papel, empresa ativa) acontece nos layouts
 * de servidor e services — proxy nunca é a única barreira.
 */

/** Rotas que exigem usuário logado. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/invites",
  "/reset-password",
  "/accept-terms",
];
/** Rotas de auth que usuário logado não deve rever. */
const AUTH_ONLY_ANONYMOUS = ["/login", "/signup", "/forgot-password"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getClientEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims valida o JWT localmente (rápido) e renova a sessão se preciso.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!isAuthenticated && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && AUTH_ONLY_ANONYMOUS.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Tudo, exceto estáticos e o webhook de pagamento (autenticado por assinatura).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
