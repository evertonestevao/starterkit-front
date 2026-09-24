"use server";

import { revalidatePath } from "next/cache";
import { getSponsorProfileService } from "@/server/sponsorProfile";
import { toActionError, type ActionState } from "./action-state";

/** Server actions do perfil do patrocinador (nome, logo, link e telefone). */

const PERFIL = "/patrocinador/perfil";

export async function requestProfileChangeAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const service = await getSponsorProfileService();
    const displayName = formData.get("displayName");
    const link = formData.get("link");

    // O arquivo vira bytes aqui e só. Quem decide se é imagem — e qual — é o
    // service, olhando a assinatura binária; o tipo que o navegador declara
    // não vale como prova.
    const arquivo = formData.get("logo");
    const logo =
      arquivo instanceof File && arquivo.size > 0
        ? {
            bytes: new Uint8Array(await arquivo.arrayBuffer()),
            declaredType: arquivo.type,
          }
        : null;

    const pediu = await service.requestChange(
      {
        displayName: typeof displayName === "string" ? displayName : undefined,
        link: typeof link === "string" ? link : undefined,
      },
      logo,
    );

    // O telefone não passa por moderação: não aparece em página nenhuma.
    await service.updatePhone(formData.get("phone"));
    // Liga/desliga a vitrine: também não passa por moderação (não é conteúdo).
    await service.updateVisibility(formData.get("visibleOnPage") === "on");

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
