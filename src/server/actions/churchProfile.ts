"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseStorageProvider } from "@/adapters/storage/supabaseStorageProvider";
import { AppError } from "@/lib/errors";
import { EXTENSAO_POR_TIPO, MAX_LOGO_BYTES, sniffImageType } from "@/lib/imageValidation";
import { CHURCH_LOGOS_BUCKET, getChurchProfileService } from "@/server/churchProfile";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

/** Server actions da página da igreja (nome, endereço, redes, logo, endereço público). */

const PAGINA = "/dashboard/settings/igreja";

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

async function ator() {
  // Empresa e papel vêm da sessão, nunca do formulário.
  const { active } = await getActiveTenant();
  if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new AppError("unauthorized", "Sessão expirada.");
  return { companyId: active.id, role: active.role, userId: data.user.id };
}

export async function saveChurchProfileAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const service = await getChurchProfileService();
    await service.save(actor, {
      churchId: texto(formData, "churchId"),
      name: texto(formData, "name"),
      sobrenome: texto(formData, "sobrenome"),
      // Checkbox nativo: marcado posta "on".
      herdarNome: texto(formData, "herdarNome") === "on",
      address: texto(formData, "address"),
      publicCode: texto(formData, "publicCode"),
      instagram: texto(formData, "instagram"),
      whatsapp: texto(formData, "whatsapp"),
      youtube: texto(formData, "youtube"),
      facebook: texto(formData, "facebook"),
      site: texto(formData, "site"),
    });

    revalidatePath(PAGINA);
    // A página pública muda junto: sem isto, a igreja salva e não vê efeito.
    revalidatePath(`/igreja/${texto(formData, "publicCode").trim().toLowerCase()}`);
    return { success: "Página da igreja atualizada." };
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Tema e cor de destaque da página. A cor é validada (e limitada a #rrggbb)
 * no service: ela vira atributo `style` numa página pública.
 */
export async function saveChurchAppearanceAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    await (await getChurchProfileService()).saveAppearance(actor, {
      churchId: texto(formData, "churchId"),
      mode: texto(formData, "mode"),
      theme: texto(formData, "theme"),
      accentColor: texto(formData, "accentColor"),
    });

    revalidatePath(PAGINA);
    // Só para a página mostrar o novo visual; o valor não é confiado para mais nada.
    revalidatePath(`/igreja/${texto(formData, "publicCode").trim().toLowerCase()}`);
    return { success: "Aparência da página atualizada." };
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Logo da igreja. O tipo vem dos BYTES (regra do CLAUDE.md): `Content-Type` e
 * extensão são escolhidos por quem envia, e um arquivo executável renomeado
 * para .png entraria num bucket público.
 */
export async function uploadChurchLogoAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const churchId = texto(formData, "churchId");
    const arquivo = formData.get("logo");
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
    const storage = createSupabaseStorageProvider(client, CHURCH_LOGOS_BUCKET);
    // Pasta = id da igreja; as policies do bucket só aceitam quem administra
    // aquela igreja.
    const { path } = await storage.upload({
      path: `${churchId}/logo.${EXTENSAO_POR_TIPO[tipo]}`,
      content: bytes,
      contentType: tipo,
      upsert: true,
    });

    // O path é fixo, então a URL precisa mudar para o cache soltar a imagem.
    const url = `${storage.getPublicUrl(path)}?v=${Date.now()}`;
    await (await getChurchProfileService()).setLogo(actor, churchId, url);

    revalidatePath(PAGINA);
    return { success: "Logo atualizado." };
  } catch (err) {
    return toActionError(err);
  }
}
