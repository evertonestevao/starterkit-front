"use server";

import { revalidatePath } from "next/cache";
import { getSponsorProfileService } from "@/server/sponsorProfile";
import { toActionError, type ActionState } from "./action-state";

/** Server actions do perfil do patrocinador (nome, logo e telefone). */

const PERFIL = "/patrocinador/perfil";

export async function requestProfileChangeAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const service = await getSponsorProfileService();
    const displayName = formData.get("displayName");

    const pediu = await service.requestChange({
      displayName: typeof displayName === "string" ? displayName : undefined,
    });

    // O telefone não passa por moderação: não aparece em página nenhuma.
    await service.updatePhone(formData.get("phone"));

    revalidatePath(PERFIL);
    return {
      success: pediu
        ? "Pedido enviado. A alteração entra no ar depois da conferência da nossa equipe."
        : "Dados salvos.",
    };
  } catch (err) {
    return toActionError(err);
  }
}
