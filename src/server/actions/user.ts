"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseStorageProvider } from "@/adapters/storage/supabaseStorageProvider";
import { AppError } from "@/lib/errors";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { createUserService, validateAvatarFile } from "@/services/userService";
import { toActionError, type ActionState } from "./action-state";

const AVATARS_BUCKET = "avatars";

export async function updateProfileAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const client = await getSupabaseServerClient();
    const users = createUserService(createSupabaseUserRepository(client));
    await users.updateMyProfile({ fullName: formData.get("fullName") });
    revalidatePath("/dashboard", "layout");
    return { success: "Perfil atualizado" };
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateAvatarAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const file = formData.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("validation_error", "Selecione uma imagem");
    }
    // Validação no server (o client valida antes, mas aqui é a verdade).
    const ext = validateAvatarFile({ type: file.type, size: file.size });

    const client = await getSupabaseServerClient();
    const { data } = await client.auth.getUser();
    if (!data.user) {
      throw new AppError("unauthorized", "Sessão expirada");
    }

    // Path na pasta do usuário — as policies do bucket só permitem essa pasta.
    const storage = createSupabaseStorageProvider(client, AVATARS_BUCKET);
    const { path } = await storage.upload({
      path: `${data.user.id}/avatar.${ext}`,
      content: await file.arrayBuffer(),
      contentType: file.type,
      upsert: true,
    });

    // Query string de cache-busting: o path é fixo, a URL precisa mudar.
    const url = `${storage.getPublicUrl(path)}?v=${Date.now()}`;
    const users = createUserService(createSupabaseUserRepository(client));
    await users.updateMyAvatar({ avatarUrl: url });

    revalidatePath("/dashboard", "layout");
    return { success: "Avatar atualizado" };
  } catch (err) {
    return toActionError(err);
  }
}
