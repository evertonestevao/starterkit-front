"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import { qrPngDataUrl } from "@/lib/qr";
import { getChurchSelfPaymentService } from "@/server/churchSelfPayment";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import type { PixParaAutorizar } from "@/services/churchSelfPaymentService";
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

/** O QR Code do Pix Automático, pronto para a tela: a imagem e o "copia e cola". */
export interface PixNaTela {
  qrDataUrl: string;
  payload: string;
  expiresAt: string | null;
}

export type MensalidadeActionState = ActionState & { pix?: PixNaTela };

async function pixParaTela(pix: PixParaAutorizar): Promise<PixNaTela> {
  return { qrDataUrl: await qrPngDataUrl(pix.payload, 320), payload: pix.payload, expiresAt: pix.expiresAt };
}

/** Pago o cartão, o provedor devolve a pessoa para a tela da mensalidade. */
const voltarPara = () => `${getServerEnv().APP_URL.replace(/\/+$/, "")}/dashboard/mensalidade`;

/**
 * Cadastra quem paga e começa a cobrança na forma escolhida. Cartão: leva à
 * página do provedor onde o cartão é informado. Pix Automático: devolve o QR
 * Code para a tela mostrar.
 */
export async function enableChurchSelfPaymentAction(
  _prev: MensalidadeActionState | undefined,
  formData: FormData,
): Promise<MensalidadeActionState> {
  let pagamento: string | null;
  try {
    await requireSession();
    const churchId = texto(formData, "churchId");
    const { invoiceUrl, pix } = await (
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
      { successUrl: voltarPara(), method: texto(formData, "method") || "card" },
    );
    revalidar();
    if (pix) return { success: "Cadastro feito. Falta autorizar o Pix.", pix: await pixParaTela(pix) };
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

/**
 * Recomeça um pagamento que ficou sem concluir (QR Code vencido, ou a
 * autorização do Pix cancelada por mudança de valor), na forma escolhida.
 */
export async function retomarMensalidadeAction(churchId: string, method: string): Promise<MensalidadeActionState> {
  let pagamento: string | null;
  try {
    await requireSession();
    const { invoiceUrl, pix } = await (
      await getChurchSelfPaymentService()
    ).retomar(churchId, method, { successUrl: voltarPara() });
    revalidar();
    if (pix) return { pix: await pixParaTela(pix) };
    pagamento = invoiceUrl;
  } catch (err) {
    return toActionError(err);
  }
  if (pagamento) redirect(pagamento);
  return { success: "Pagamento retomado." };
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
