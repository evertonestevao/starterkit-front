"use server";

import { revalidatePath } from "next/cache";
import { getChurchSponsorsService } from "@/server/churchSponsors";
import { toActionError, type ActionState } from "./action-state";

/** Server actions da igreja sobre quem a patrocina. */

const PAGINA = "/dashboard/sponsors";

export async function setSponsorHiddenAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const esconder = formData.get("acao") === "esconder";
    const service = await getChurchSponsorsService();

    // A autorização real é `is_company_admin` dentro da RPC: o id do
    // patrocínio vem do formulário e não prova nada sozinho.
    await service.setHidden({
      sponsorshipId: String(formData.get("sponsorshipId") ?? ""),
      hidden: esconder,
      reason: String(formData.get("motivo") ?? ""),
    });

    revalidatePath(PAGINA);
    return {
      success: esconder
        ? "Patrocinador escondido da página da igreja."
        : "Patrocinador voltou a aparecer na página.",
    };
  } catch (err) {
    return toActionError(err);
  }
}

export async function reportSponsorAbuseAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const service = await getChurchSponsorsService();
    await service.reportAbuse({
      sponsorshipId: String(formData.get("sponsorshipId") ?? ""),
      motivo: String(formData.get("motivo") ?? ""),
    });

    revalidatePath(PAGINA);
    return { success: "Denúncia enviada. Nossa equipe vai analisar." };
  } catch (err) {
    return toActionError(err);
  }
}
