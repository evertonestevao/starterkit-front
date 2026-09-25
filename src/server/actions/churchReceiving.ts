"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { assertReceivingConfigured, getChurchReceivingService } from "@/server/churchReceiving";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

/** Server actions do recebimento por cartão (subconta da igreja). */

const PAGINA = "/dashboard/settings/recebimento";

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

export async function submitReceivingRegistrationAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    assertReceivingConfigured();
    const actor = await ator();
    const service = await getChurchReceivingService();
    const conta = await service.submitRegistration(actor, {
      churchId: texto(formData, "churchId"),
      razaoSocial: texto(formData, "razaoSocial"),
      documento: texto(formData, "documento"),
      email: texto(formData, "email"),
      telefone: texto(formData, "telefone"),
      cep: texto(formData, "cep"),
      endereco: texto(formData, "endereco"),
      enderecoNumero: texto(formData, "enderecoNumero"),
      bairro: texto(formData, "bairro"),
      cidade: texto(formData, "cidade"),
      uf: texto(formData, "uf"),
      nascimento: texto(formData, "nascimento"),
      rendaMensal: texto(formData, "rendaMensal"),
    });

    revalidatePath(PAGINA);
    return {
      success:
        conta.status === "aprovada"
          ? "Conta aprovada. Você já pode ligar o cartão na página da igreja."
          : "Cadastro enviado. O provedor analisa e avisamos aqui quando decidir.",
    };
  } catch (err) {
    return toActionError(err);
  }
}

export async function syncReceivingStatusAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    assertReceivingConfigured();
    const actor = await ator();
    const service = await getChurchReceivingService();
    const status = await service.syncStatus(actor, texto(formData, "churchId"));

    revalidatePath(PAGINA);
    const mensagens: Record<string, string> = {
      em_analise: "O provedor ainda está analisando o cadastro.",
      aprovada: "Conta aprovada. Você já pode ligar o cartão na página da igreja.",
      recusada: "O provedor recusou o cadastro. Revise os dados e envie de novo.",
      suspensa: "A conta está suspensa no provedor. Fale com eles para entender o motivo.",
    };
    return { success: mensagens[status] ?? "Situação atualizada." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Liga ou desliga o botão de cartão na página pública da igreja. */
export async function setCardEnabledAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await ator();
    const aceita = texto(formData, "aceita") === "true";
    const service = await getChurchReceivingService();
    await service.setCardEnabled(actor, texto(formData, "churchId"), aceita);

    revalidatePath(PAGINA);
    return {
      success: aceita
        ? "Cartão ligado. O botão já aparece na página da igreja."
        : "Cartão desligado. A página segue com a chave PIX.",
    };
  } catch (err) {
    return toActionError(err);
  }
}
