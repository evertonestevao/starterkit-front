"use server";

import { redirect } from "next/navigation";
import { getCampaignDonationsService } from "@/server/campaigns";
import { toActionError, type ActionState } from "./action-state";

/** Server actions da doação pública numa campanha (sem login). */

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

/**
 * Diferente do ActionState comum: o sucesso do PIX precisa devolver o QR e o
 * "copia e cola" com o valor já embutido, não só uma frase.
 */
export interface PixCampaignDonationState {
  error?: string;
  success?: {
    donationId: string;
    pixChave: string;
    pixCopiaECola: string;
    pixQrDataUrl: string;
  };
}

export async function submitPixCampaignDonationAction(
  _prev: PixCampaignDonationState | undefined,
  formData: FormData,
): Promise<PixCampaignDonationState> {
  try {
    const resultado = await (await getCampaignDonationsService()).submitPixDonation({
      campaignId: texto(formData, "campaignId"),
      nome: texto(formData, "nome"),
      telefone: texto(formData, "telefone"),
      valor: texto(formData, "valor"),
    });
    return { success: resultado };
  } catch (err) {
    return toActionError(err) as PixCampaignDonationState;
  }
}

/** Cartão: cria a cobrança e manda quem doa direto para o checkout da Asaas. */
export async function submitGatewayCampaignDonationAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  let destino: string;
  try {
    const resultado = await (await getCampaignDonationsService()).submitGatewayDonation({
      campaignId: texto(formData, "campaignId"),
      nome: texto(formData, "nome"),
      telefone: texto(formData, "telefone"),
      valor: texto(formData, "valor"),
    });
    destino = resultado.checkoutUrl;
  } catch (err) {
    return toActionError(err);
  }
  // Fora do try: redirect lança um sinal interno que o catch engoliria.
  redirect(destino);
}
