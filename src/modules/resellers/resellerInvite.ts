import "server-only";
import { randomBytes } from "node:crypto";
import { getEmailProvider } from "@/adapters/email";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import { getSupabaseAdminClient } from "@/server/supabase-admin";
import { slugify } from "@/services/tenantService";
import { normalizeReferralCode } from "./referralCookie";

/** Conta e e-mail do convite. Criar usuário no Auth exige service_role. */

export function generateReferralCode(name: string): string {
  const base = slugify(name).slice(0, 40) || "vendedor";
  return normalizeReferralCode(`${base}-${randomBytes(2).toString("hex")}`) ?? randomBytes(4).toString("hex");
}

function confirmUrl(tokenHash: string, type: "invite" | "recovery"): string {
  const base = getServerEnv().APP_URL.replace(/\/+$/, "");
  return `${base}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}&next=/reset-password`;
}

async function generateLink(type: "invite" | "recovery", email: string, name?: string) {
  const { data, error } = await getSupabaseAdminClient().auth.admin.generateLink(
    type === "invite"
      ? { type, email, options: { data: { full_name: name } } }
      : { type, email },
  );
  if (error || !data.user) {
    throw new AppError("internal_error", "Falha ao gerar o convite", error);
  }
  return { userId: data.user.id, url: confirmUrl(data.properties.hashed_token, type) };
}

/** E-mail novo ganha conta e link para definir senha; existente mantém a própria senha. */
export async function prepareResellerAccount(email: string, name: string) {
  const { data: existingId, error } = await getSupabaseAdminClient().rpc("find_user_id_by_email", {
    p_email: email,
  });
  if (error) throw new AppError("internal_error", "Falha ao procurar a conta", error);
  if (existingId) {
    const base = getServerEnv().APP_URL.replace(/\/+$/, "");
    return { userId: existingId as string, url: `${base}/login`, hasPassword: true };
  }
  const link = await generateLink("invite", email, name);
  return { ...link, hasPassword: false };
}

export async function sendResellerInviteEmail(email: string, url: string, hasPassword: boolean) {
  const action = hasPassword ? "Entre com a sua conta" : "Defina sua senha";
  await getEmailProvider().send({
    to: email,
    subject: "Você foi cadastrado como vendedor",
    text: `Você foi cadastrado como vendedor. ${action}: ${url}`,
    html: [
      "<p>Você foi cadastrado como vendedor.</p>",
      `<p><a href="${url}">${action}</a></p>`,
      "<p>Se você não esperava este e-mail, ignore-o.</p>",
    ].join("\n"),
  });
}

/** Reenvio: link novo para definir a senha, que também serve se o primeiro expirou. */
export async function resendResellerInvite(email: string) {
  const link = await generateLink("recovery", email);
  await sendResellerInviteEmail(email, link.url, false);
}
