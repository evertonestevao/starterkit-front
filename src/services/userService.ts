import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { Profile } from "@/types/database";

/** Perfil do usuário logado (dados pessoais, não de empresa). */

export interface UserRepository {
  getMyProfile(): Promise<Profile | null>;
  updateMyProfile(data: { full_name?: string; avatar_url?: string }): Promise<void>;
}

const fullNameSchema = z.string().trim().min(2, "Informe seu nome").max(120);

/** Regras do avatar — validadas no client (feedback) E no server (verdade). */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2MB, espelha o limite do bucket
export const AVATAR_ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Valida tipo/tamanho e devolve a extensão do arquivo. Pura e testável. */
export function validateAvatarFile(file: { type: string; size: number }): string {
  const ext = AVATAR_ALLOWED_TYPES[file.type];
  if (!ext) {
    throw new AppError("validation_error", "Formato inválido: use JPG, PNG ou WebP");
  }
  if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
    throw new AppError("validation_error", "A imagem deve ter no máximo 2MB");
  }
  return ext;
}

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

  async function updateMyAvatar(input: { avatarUrl: unknown }): Promise<void> {
    // Só http(s): URL vai parar num src de <img>; esquemas como javascript:
    // ou data: não têm por que existir aqui.
    const parsed = z.url({ protocol: /^https?$/ }).safeParse(input.avatarUrl);
    if (!parsed.success) {
      throw new AppError("validation_error", "URL de avatar inválida");
    }
    await repo.updateMyProfile({ avatar_url: parsed.data });
  }

  return { getMyProfile, updateMyProfile, updateMyAvatar };
}

export type UserService = ReturnType<typeof createUserService>;
