import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/server/supabase-server";

/**
 * Destino dos links de email do Supabase Auth (recuperação de senha e
 * confirmação de cadastro): troca o token_hash por uma sessão e redireciona.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(type === "recovery" ? "/reset-password" : "/dashboard");
    }
  }

  redirect("/login?error=link-invalido");
}
