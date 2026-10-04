"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseStorageProvider } from "@/adapters/storage/supabaseStorageProvider";
import { AppError } from "@/lib/errors";
import { EXTENSAO_POR_TIPO, MAX_LOGO_BYTES, sniffImageType } from "@/lib/imageValidation";
import { CAMPAIGN_MEDIA_BUCKET, getCampaignsService } from "@/server/campaigns";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

/** Server actions das campanhas, do lado da igreja. */

const PAGINA = "/dashboard/campaigns";

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

async function ator() {
  // Empresa e papel vêm da sessão, nunca do formulário.
  const { active } = await getActiveTenant();
  if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  return { companyId: active.id, role: active.role, liberado: active.acessos.includes("campaigns") };
}

function camposDoFormulario(formData: FormData) {
  return {
    titulo: texto(formData, "titulo"),
    historia: texto(formData, "historia"),
    meta: texto(formData, "meta"),
    metodoRecebimento: texto(formData, "metodoRecebimento"),
    mostrarProgresso: formData.get("mostrarProgresso") === "on",
    permitirValorLivre: formData.get("permitirValorLivre") === "on",
    valorSugerido1: texto(formData, "valorSugerido1"),
    valorSugerido2: texto(formData, "valorSugerido2"),
    valorSugerido3: texto(formData, "valorSugerido3"),
    valorPadraoIndice: texto(formData, "valorPadraoIndice"),
  };
}

export async function createCampaignAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const titulo = texto(formData, "titulo");
    await (await getCampaignsService()).create(actor, {
      churchId: texto(formData, "churchId"),
      ...camposDoFormulario(formData),
    });
    revalidatePath(PAGINA);
    return { success: `“${titulo.trim()}” criada como rascunho. Ative quando estiver pronta.` };
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateCampaignAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const campaignId = texto(formData, "campaignId");
    await (await getCampaignsService()).update(actor, {
      campaignId,
      ...camposDoFormulario(formData),
    });
    revalidatePath(PAGINA);
    revalidatePath(`${PAGINA}/${campaignId}`);
    return { success: "Campanha atualizada." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function activateCampaignAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const campaignId = texto(formData, "campaignId");
    await (await getCampaignsService()).activate(actor, campaignId);
    revalidatePath(PAGINA);
    revalidatePath(`${PAGINA}/${campaignId}`);
    return { success: "Campanha ativada e publicada na página da igreja." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function closeCampaignAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const campaignId = texto(formData, "campaignId");
    await (await getCampaignsService()).close(actor, campaignId);
    revalidatePath(PAGINA);
    revalidatePath(`${PAGINA}/${campaignId}`);
    return { success: "Campanha encerrada. Ela continua na página com o resultado." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function setCampaignFeedbackAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const campaignId = texto(formData, "campaignId");
    await (await getCampaignsService()).setFeedback(actor, {
      campaignId,
      feedbackTexto: texto(formData, "feedbackTexto"),
    });
    revalidatePath(PAGINA);
    revalidatePath(`${PAGINA}/${campaignId}`);
    return { success: "Devolutiva salva." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function removeCampaignAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    await (await getCampaignsService()).remove(actor, texto(formData, "campaignId"));
    revalidatePath(PAGINA);
    return { success: "Campanha removida." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function confirmPixDonationAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const campaignId = texto(formData, "campaignId");
    await (await getCampaignsService()).confirmPixDonation(actor, texto(formData, "donationId"));
    revalidatePath(`${PAGINA}/${campaignId}`);
    return { success: "Doação confirmada e somada ao total da campanha." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Upload de imagem, mesmo padrão de uploadChurchLogoAction: tipo vem dos bytes. */
async function uploadImagem(
  formData: FormData,
  campo: string,
  pastaEArquivo: (campaignId: string, ext: string) => string,
): Promise<{ campaignId: string; url: string }> {
  const campaignId = texto(formData, "campaignId");
  const arquivo = formData.get(campo);
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    throw new AppError("validation_error", "Escolha uma imagem.");
  }
  if (arquivo.size > MAX_LOGO_BYTES) {
    throw new AppError("validation_error", "A imagem deve ter no máximo 1MB.");
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = sniffImageType(bytes);
  if (!tipo) {
    throw new AppError("validation_error", "Formato inválido: use JPG, PNG ou WebP.");
  }

  const client = await getSupabaseServerClient();
  const storage = createSupabaseStorageProvider(client, CAMPAIGN_MEDIA_BUCKET);
  const { path } = await storage.upload({
    path: pastaEArquivo(campaignId, EXTENSAO_POR_TIPO[tipo]),
    content: bytes,
    contentType: tipo,
    upsert: true,
  });

  // O path é fixo, então a URL precisa mudar para o cache soltar a imagem.
  return { campaignId, url: `${storage.getPublicUrl(path)}?v=${Date.now()}` };
}

export async function uploadCampaignCoverAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const { campaignId, url } = await uploadImagem(formData, "capa", (id, ext) => `${id}/capa.${ext}`);
    await (await getCampaignsService()).setCover(actor, campaignId, url);
    revalidatePath(PAGINA);
    revalidatePath(`${PAGINA}/${campaignId}`);
    return { success: "Capa atualizada." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function uploadCampaignFeedbackPhotoAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const { campaignId, url } = await uploadImagem(formData, "feedbackFoto", (id, ext) => `${id}/feedback.${ext}`);
    await (await getCampaignsService()).setFeedbackFoto(actor, campaignId, url);
    revalidatePath(PAGINA);
    revalidatePath(`${PAGINA}/${campaignId}`);
    return { success: "Foto da devolutiva atualizada." };
  } catch (err) {
    return toActionError(err);
  }
}
