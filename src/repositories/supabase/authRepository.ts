import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { AuthRepository } from "@/services/authService";

/**
 * Implementação Supabase Auth do AuthRepository. Recebe o client vinculado
 * aos cookies da request (getSupabaseServerClient) — as sessões são gravadas
 * pelos handlers de cookie do @supabase/ssr.
 */
export function createSupabaseAuthRepository(client: SupabaseClient): AuthRepository {
  return {
    async signUp({ email, password, fullName }) {
      const { error } = await client.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
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
        throw new AppError("unauthorized", "Não foi possível alterar a senha", error);
      }
    },
  };
}
