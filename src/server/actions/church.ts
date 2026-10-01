"use server";

import { getPublicSubmissionService } from "@/server/publicSubmission";
import { toActionError, type ActionState } from "./action-state";

/**
 * Formulários da página pública da igreja. Devolvem ActionState em vez de
 * lançar erro: quem está do outro lado é um visitante no celular, e um campo
 * vazio não pode virar a tela de erro do sistema. O id da igreja vem
 * vinculado pela página (bind), e o service valida o formato de novo.
 */

export async function submitPrayerRequestAction(
  churchId: string,
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await (await getPublicSubmissionService()).submitPrayerRequest({
      churchId,
      name: formData.get("name") ?? "",
      message: formData.get("message") ?? "",
    });
    return { success: "Recebemos o seu pedido. Vamos orar por você." };
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
    await (await getPublicSubmissionService()).submitVisitor({
      churchId,
      name: formData.get("name") ?? "",
      contact: formData.get("contact") ?? "",
      endereco: formData.get("endereco") ?? "",
      mensagem: formData.get("mensagem") ?? "",
    });
    return { success: "Pedido recebido! Vamos ligar para combinar o melhor dia da visita." };
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
    await (await getPublicSubmissionService()).submitEventSignup({
      eventId,
      personName: formData.get("person_name") ?? "",
      contact: formData.get("contact") ?? "",
    });
    return { success: "Inscrição feita. Até lá!" };
  } catch (err) {
    return toActionError(err);
  }
}
