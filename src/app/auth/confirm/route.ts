import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/server/supabase-server";

/**
 * Destino dos links de email do Supabase Auth (recuperação de senha e
 * confirmação de cadastro). Suporta os DOIS formatos que o GoTrue emite:
 *  - fluxo PKCE (default): chega `?code=...` para trocar por sessão;
 *  - template com token_hash: chega `?token_hash=...&type=...` (verifyOtp).
 * O destino pós-sessão vem em `?next=` (só caminho relativo, anti open
 * redirect) — o authService manda `next=/reset-password` na recuperação.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const rawNext = url.searchParams.get("next");
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  const supabase = await getSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirect(next);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(type === "recovery" ? "/reset-password" : next);
    }
  }

  redirect("/login?error=link-invalido");
}
