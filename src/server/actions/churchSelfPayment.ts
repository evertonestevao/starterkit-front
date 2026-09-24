"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { getChurchSelfPaymentService } from "@/server/churchSelfPayment";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

const PAGINA = "/dashboard/sponsors";

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

/** Só confere sessão: a permissão de verdade (dono desta igreja) é da RPC. */
async function requireSession() {
  const { active } = await getActiveTenant();
  if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new AppError("unauthorized", "Sessão expirada.");
}

export async function enableChurchSelfPaymentAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const churchId = texto(formData, "churchId");
    await (await getChurchSelfPaymentService()).enable(churchId, {
      kind: texto(formData, "kind"),
      displayName: texto(formData, "displayName"),
      email: texto(formData, "email"),
      phone: texto(formData, "phone"),
      document: texto(formData, "document"),
    });
    revalidatePath(PAGINA);
    return { success: "Mensalidade assumida. A cobrança começa agora." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function setChurchAceitaPatrocinioAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const churchId = texto(formData, "churchId");
    const aceita = texto(formData, "aceita") === "true";
    await (await getChurchSelfPaymentService()).setAceitaPatrocinio(churchId, aceita);
    revalidatePath(PAGINA);
    return {
      success: aceita
        ? "A igreja voltou a aceitar patrocinador."
        : "Porta fechada: a igreja não aparece mais para novo patrocinador.",
    };
  } catch (err) {
    return toActionError(err);
  }
}
