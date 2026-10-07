"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import { getChurchSelfPaymentService } from "@/server/churchSelfPayment";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

const PAGINAS = ["/dashboard/mensalidade", "/dashboard/sponsors"];
const revalidar = () => PAGINAS.forEach((p) => revalidatePath(p));

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
  let pagamento: string | null;
  try {
    await requireSession();
    const churchId = texto(formData, "churchId");
    const { invoiceUrl } = await (
      await getChurchSelfPaymentService()
    ).enable(
      churchId,
      {
        kind: texto(formData, "kind"),
        displayName: texto(formData, "displayName"),
        email: texto(formData, "email"),
        phone: texto(formData, "phone"),
        document: texto(formData, "document"),
      },
      // Pago o cartão, o provedor devolve a pessoa para a tela da mensalidade.
      { successUrl: `${getServerEnv().APP_URL.replace(/\/+$/, "")}/dashboard/mensalidade` },
    );
    revalidar();
    pagamento = invoiceUrl;
  } catch (err) {
    return toActionError(err);
  }
  // Fora do try: redirect() funciona lançando uma exceção própria. O endereço
  // é o da página de pagamento do provedor (onde o cartão é digitado), nunca
  // algo vindo de quem preencheu o formulário.
  if (pagamento) redirect(pagamento);
  return { success: "Pagamento cadastrado." };
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
    revalidar();
    return {
      success: aceita
        ? "A igreja voltou a aceitar patrocinador."
        : "Porta fechada: a igreja não aparece mais para novo patrocinador.",
    };
  } catch (err) {
    return toActionError(err);
  }
}
