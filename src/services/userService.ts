import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { Profile } from "@/types/database";

/** Perfil do usuário logado (dados pessoais, não de empresa). */

export interface UserRepository {
  getMyProfile(): Promise<Profile | null>;
  updateMyProfile(data: { full_name: string }): Promise<void>;
}

const fullNameSchema = z.string().trim().min(2, "Informe seu nome").max(120);

export function createUserService(repo: UserRepository) {
  async function getMyProfile(): Promise<Profile | null> {
    return repo.getMyProfile();
  }

  async function updateMyProfile(input: { fullName: unknown }): Promise<void> {
    const parsed = fullNameSchema.safeParse(input.fullName);
    if (!parsed.success) {
      throw new AppError(
        "validation_error",
        parsed.error.issues[0]?.message ?? "Nome inválido",
      );
    }
    await repo.updateMyProfile({ full_name: parsed.data });
  }

  return { getMyProfile, updateMyProfile };
}

export type UserService = ReturnType<typeof createUserService>;
