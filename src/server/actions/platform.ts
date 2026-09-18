"use server";

import { revalidatePath } from "next/cache";
import { getPlatformModerationService, requirePlatformStaff } from "@/server/platform";
import { getPublicSponsorProfileService } from "@/server/sponsorProfile";
import { toActionError, type ActionState } from "./action-state";

/** Server actions da moderação da plataforma. */

const FILA = "/plataforma/alteracoes";
const DENUNCIAS = "/plataforma/denuncias";

export async function reviewProfileChangeAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    // Checagem aqui é para falhar cedo e com mensagem clara; a barreira de
    // verdade é `is_platform_staff()` dentro da RPC.
    await requirePlatformStaff();

    const service = await getPlatformModerationService();
    const aprovada = formData.get("decisao") === "aprovar";
    await service.reviewProfileChange({
      changeId: String(formData.get("changeId") ?? ""),
      approved: aprovada,
      reason: String(formData.get("motivo") ?? ""),
      via: "painel",
    });

    revalidatePath(FILA);
    return { success: aprovada ? "Alteração publicada." : "Alteração recusada." };
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * "Não fui eu", disparado pelo botão da página do link. É POST de propósito:
 * num GET, o pré-carregamento de link que alguns clientes de email fazem
 * bloquearia a conta sozinho.
 */
export async function undoProfileChangeAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const service = await getPublicSponsorProfileService();
    const ok = await service.undoByToken(String(formData.get("token") ?? ""));
    return ok
      ? {
          success:
            "Alteração desfeita e conta bloqueada para novas alterações. Fale com o suporte para liberar.",
        }
      : { error: "Este link não vale mais. Se a alteração já foi decidida, fale com o suporte." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function reviewAbuseReportAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requirePlatformStaff();

    const service = await getPlatformModerationService();
    const procedente = formData.get("decisao") === "procedente";
    await service.reviewAbuseReport({
      reportId: String(formData.get("reportId") ?? ""),
      procedente,
      nota: String(formData.get("nota") ?? ""),
      via: "painel",
    });

    revalidatePath(DENUNCIAS);
    return {
      success: procedente
        ? "Denúncia marcada como procedente."
        : "Denúncia marcada como improcedente.",
    };
  } catch (err) {
    return toActionError(err);
  }
}
