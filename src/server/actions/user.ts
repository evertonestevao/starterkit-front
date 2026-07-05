"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { createUserService } from "@/services/userService";
import { toActionError, type ActionState } from "./action-state";

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
