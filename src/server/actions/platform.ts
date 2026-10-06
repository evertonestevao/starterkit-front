"use server";

import { revalidatePath } from "next/cache";
import {
  getChurchHierarchyService,
  getPlatformModerationService,
  getPlatformPricingService,
  getPlatformSettingsService,
  requirePlatformStaff,
} from "@/server/platform";
import { getPixModeracaoService } from "@/server/pixModeracao";
import { getPublicSponsorProfileService } from "@/server/sponsorProfile";
import { toActionError, type ActionState } from "./action-state";

/** Server actions da moderação da plataforma. */

// Toda decisão muda um número do menu, que vive no layout: revalidar só a
// página deixaria o badge mostrando a contagem velha.

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

    revalidatePath("/plataforma", "layout");
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

    revalidatePath("/plataforma", "layout");
    return {
      success: procedente
        ? "Denúncia marcada como procedente."
        : "Denúncia marcada como improcedente.",
    };
  } catch (err) {
    return toActionError(err);
  }
}

export async function releaseSecurityHoldAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requirePlatformStaff();

    const service = await getPlatformModerationService();
    await service.releaseSecurityHold({
      sponsorAccountId: String(formData.get("sponsorAccountId") ?? ""),
      via: "painel",
    });

    revalidatePath("/plataforma", "layout");
    return { success: "Conta liberada. O patrocinador já pode pedir alterações de novo." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Define o tipo da igreja e a igreja acima dela (ex.: ligar subsede à sede). */
export async function setChurchHierarchyAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requirePlatformStaff();
    const service = await getChurchHierarchyService();
    await service.setHierarchy({
      churchId: String(formData.get("churchId") ?? ""),
      tipo: String(formData.get("tipo") ?? ""),
      parentId: String(formData.get("parentId") ?? ""),
    });
    revalidatePath("/plataforma/igrejas");
    return { success: "Hierarquia salva." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Vagas de primeiro patrocínio e carência da marca. */
export async function updatePlatformSettingsAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requirePlatformStaff();
    const service = await getPlatformSettingsService();
    await service.update({
      vagasSede: formData.get("vagasSede"),
      vagasSubsede: formData.get("vagasSubsede"),
      vagasCongregacao: formData.get("vagasCongregacao"),
      carenciaMarcaDias: formData.get("carenciaMarcaDias"),
    });
    revalidatePath("/plataforma/configuracoes");
    return { success: "Configurações salvas." };
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Salva a tabela de preço do patrocínio inteira. Os campos chegam como
 * `amount_1`, `amount_2`... — um por posição, na ordem em que o formulário
 * os desenhou (adicionar/remover posição só muda quantos campos existem).
 */
export async function updateSponsorPricingAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requirePlatformStaff();
    const service = await getPlatformPricingService();

    const tiers: { position: number; amountRaw: string }[] = [];
    for (let position = 1; formData.has(`amount_${position}`); position += 1) {
      tiers.push({ position, amountRaw: String(formData.get(`amount_${position}`) ?? "") });
    }

    await service.updateTiers(tiers);
    revalidatePath("/plataforma/configuracoes");
    return { success: "Preços salvos." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateAutopatrocinioAmountAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requirePlatformStaff();
    const service = await getPlatformSettingsService();
    await service.updateAutopatrocinioAmount(String(formData.get("amount") ?? ""));
    revalidatePath("/plataforma/configuracoes");
    return { success: "Valor do autopatrocínio salvo." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Aprova ou recusa a chave Pix de uma igreja (só depois disso ela aparece na página). */
export async function decidirPixAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    await requirePlatformStaff();
    const { aprovado } = await (await getPixModeracaoService()).decidir({
      churchId: String(formData.get("churchId") ?? ""),
      aprovar: formData.get("decisao") === "aprovar",
      motivo: String(formData.get("motivo") ?? ""),
    });
    revalidatePath("/plataforma", "layout");
    revalidatePath("/igreja/[public_code]", "layout");
    return {
      success: aprovado
        ? "Chave aprovada. Ela já aparece na página da igreja."
        : "Chave recusada. A igreja vê o motivo na tela do Pix.",
    };
  } catch (err) {
    return toActionError(err);
  }
}
