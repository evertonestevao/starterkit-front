import "server-only";
import { cache } from "react";
import { getChurchSelfPaymentService } from "./churchSelfPayment";
import { getActiveTenant } from "./tenant";

/**
 * O painel da igreja ativa está suspenso por mensalidade pendente? Uma
 * consulta por request (o layout e cada guarda de tela perguntam).
 *
 * Se a consulta falhar, a resposta é "não": um erro nosso não pode trancar a
 * igreja para fora do próprio painel.
 */
export const getMensalidadeBloqueada = cache(async (): Promise<boolean> => {
  const { active } = await getActiveTenant();
  if (!active) return false;
  try {
    return await (await getChurchSelfPaymentService()).bloqueada(active.id);
  } catch (err) {
    console.error("[painel] falha ao verificar a suspensão por mensalidade", err);
    return false;
  }
});
