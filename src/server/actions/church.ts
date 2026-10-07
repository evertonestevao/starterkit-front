"use server";

import { protegerEnvioPublico } from "@/server/protecaoPublica";
import { getPublicSubmissionService } from "@/server/publicSubmission";
import { toActionError, type ActionState } from "./action-state";

/**
 * Formulários da página pública da igreja. Devolvem ActionState em vez de
 * lançar erro: quem está do outro lado é um visitante no celular, e um campo
 * vazio não pode virar a tela de erro do sistema. O id da igreja vem
 * vinculado pela página (bind), e o service valida o formato de novo.
 *
 * Toda action aqui passa por `protegerEnvioPublico` antes de gravar: barreira
 * contra robôs e limite de envios por pessoa.
 */

export async function submitPrayerRequestAction(
  churchId: string,
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ok = "Recebemos o seu pedido. Vamos orar por você.";
    // Robô recebe a mesma resposta de quem enviou de verdade, e nada é gravado.
    if ((await protegerEnvioPublico("oracao", churchId, formData)).robo) return { success: ok };
    await (await getPublicSubmissionService()).submitPrayerRequest({
      churchId,
      name: formData.get("name") ?? "",
      message: formData.get("message") ?? "",
    });
    return { success: ok };
  } catch (err) {
    return toActionError(err);
  }
}

export async function submitVisitorAction(
  churchId: string,
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ok = "Pedido recebido! Vamos ligar para combinar o melhor dia da visita.";
    if ((await protegerEnvioPublico("visita", churchId, formData)).robo) return { success: ok };
    await (await getPublicSubmissionService()).submitVisitor({
      churchId,
      name: formData.get("name") ?? "",
      contact: formData.get("contact") ?? "",
      endereco: formData.get("endereco") ?? "",
      mensagem: formData.get("mensagem") ?? "",
    });
    return { success: ok };
  } catch (err) {
    return toActionError(err);
  }
}

export async function submitEventSignupAction(
  eventId: string,
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ok = "Inscrição feita. Até lá!";
    if ((await protegerEnvioPublico("evento", eventId, formData)).robo) return { success: ok };
    await (await getPublicSubmissionService()).submitEventSignup({
      eventId,
      personName: formData.get("person_name") ?? "",
      contact: formData.get("contact") ?? "",
    });
    return { success: ok };
  } catch (err) {
    return toActionError(err);
  }
}
