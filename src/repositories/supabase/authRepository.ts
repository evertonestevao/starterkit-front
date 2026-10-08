import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getClientEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import type { AuthRepository } from "@/services/authService";

/**
 * Implementação Supabase Auth do AuthRepository. Recebe o client vinculado
 * aos cookies da request (getSupabaseServerClient) — as sessões são gravadas
 * pelos handlers de cookie do @supabase/ssr.
 */
const SENHA_FRACA =
  "A senha não atende aos requisitos: pelo menos 8 caracteres, com letra maiúscula, letra minúscula, número e símbolo.";

export function createSupabaseAuthRepository(client: SupabaseClient): AuthRepository {
  return {
    async signUp({ email, password, fullName }) {
      const { error } = await client.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
        // Senha fraca não revela nada sobre a conta: pode dizer o porquê.
        if (error.code === "weak_password") throw new AppError("validation_error", SENHA_FRACA, error);
        // Mensagem genérica: não revelar se o email já está cadastrado.
        throw new AppError("validation_error", "Não foi possível criar a conta", error);
      }
    },

    async signInWithPassword({ email, password }) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        throw new AppError("unauthorized", "Email ou senha incorretos", error);
      }
    },

    async signOut() {
      await client.auth.signOut();
    },

    async resetPasswordForEmail(email, redirectTo) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        // Não vazar se o email existe: logar internamente e seguir em silêncio.
        console.error("[auth] resetPasswordForEmail falhou:", error.message);
      }
    },

    async updatePassword(newPassword) {
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) {
        if (error.code === "weak_password") throw new AppError("validation_error", SENHA_FRACA, error);
        if (error.code === "same_password") {
          throw new AppError("validation_error", "A nova senha precisa ser diferente da atual.", error);
        }
        throw new AppError("unauthorized", "Não foi possível alterar a senha", error);
      }
    },

    async emailDoUsuarioAtual() {
      const { data } = await client.auth.getUser();
      return data.user?.email ?? null;
    },

    async senhaConfere(email, senha) {
      // Cliente à parte, sem cookie: confere a senha sem trocar a sessão de
      // quem está usando a tela. A sessão criada aqui é descartada na hora.
      const env = getClientEnv();
      const avulso = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { error } = await avulso.auth.signInWithPassword({ email, password: senha });
      if (error) return false;
      await avulso.auth.signOut({ scope: "local" }).catch(() => {});
      return true;
    },
  };
}
