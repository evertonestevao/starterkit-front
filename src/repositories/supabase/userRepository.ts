import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { UserRepository } from "@/services/userService";
import type { Profile } from "@/types/database";

export function createSupabaseUserRepository(client: SupabaseClient): UserRepository {
  return {
    async getMyProfile() {
      const { data: userData } = await client.auth.getUser();
      if (!userData.user) return null;
      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("id", userData.user.id)
        .maybeSingle<Profile>();
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar perfil", error);
      }
      return data;
    },

    async updateMyProfile(update) {
      const { data: userData } = await client.auth.getUser();
      if (!userData.user) {
        throw new AppError("unauthorized", "Sessão expirada");
      }
      const { error } = await client
        .from("profiles")
        .update(update)
        .eq("id", userData.user.id);
      if (error) {
        throw new AppError("internal_error", "Falha ao atualizar perfil", error);
      }
    },
  };
}
