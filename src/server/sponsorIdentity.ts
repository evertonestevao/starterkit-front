import "server-only";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import type { SponsorIdentityProvider } from "@/services/sponsorService";
import { getSupabaseAdminClient } from "./supabase-admin";

/**
 * Acesso do patrocinador que assinou SEM login.
 *
 * A conta nasce sem senha: a prova de que o email é dele é o clique no link
 * de uso único. O link aponta para /auth/confirm, que é quem troca o token
 * por sessão (mesmo caminho dos emails de recuperação de senha).
 */

/** Códigos do GoTrue para "esse email já está cadastrado". */
const ALREADY_REGISTERED = new Set(["email_exists", "user_already_exists"]);

function isAlreadyRegistered(error: { code?: string; message?: string; status?: number }): boolean {
  if (error.code && ALREADY_REGISTERED.has(error.code)) return true;
  const message = error.message?.toLowerCase() ?? "";
  return message.includes("already registered") || message.includes("already exists");
}

export function getSponsorIdentityProvider(): SponsorIdentityProvider {
  const admin = getSupabaseAdminClient();
  const appUrl = getServerEnv().APP_URL.replace(/\/+$/, "");

  return {
    async createPasswordlessUser({ email, fullName }) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        // Quem chegou pelo link de patrocínio e vai pagar não deve ainda
        // receber email de confirmação: o acesso vem do link que enviamos.
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (error) {
        if (isAlreadyRegistered(error)) {
          // NÃO é erro: é o outro caminho do fluxo.
          return { userId: null, alreadyExists: true };
        }
        throw new AppError("internal_error", "Falha ao criar o acesso", error);
      }
      return { userId: data.user?.id ?? null, alreadyExists: false };
    },

    async createAccessLink(email, nextPath) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (error || !data.properties?.hashed_token) {
        throw new AppError("internal_error", "Falha ao gerar o link de acesso", error);
      }

      const safeNext = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/patrocinador";
      const url = new URL(`${appUrl}/auth/confirm`);
      url.searchParams.set("token_hash", data.properties.hashed_token);
      url.searchParams.set("type", "magiclink");
      url.searchParams.set("next", safeNext);
      return url.toString();
    },
  };
}
