"use server";

import { recordPixCopy } from "@/server/churchVisits";

/**
 * "Copiei a chave PIX" da página pública.
 *
 * É o único sinal de doação que a plataforma tem: no v1 o dinheiro vai direto
 * do banco de quem doa para o da igreja, e nós não vemos nada disso. Copiar a
 * chave é INTENÇÃO de doar, não doação — e é assim que a métrica é
 * apresentada.
 *
 * Não devolve nada e não trava a cópia: o botão já copiou antes de chamar.
 */
export async function registerPixCopyAction(churchId: string): Promise<void> {
  await recordPixCopy(churchId);
}
