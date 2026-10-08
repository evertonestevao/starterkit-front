import "server-only";
import { headers } from "next/headers";
import { CAMPO_INICIO, CAMPO_ISCA, ipDoPedido, pareceRobo } from "@/lib/antiRobo";
import { getServerEnv } from "@/config/env";
import { createRateLimiter } from "./rateLimit";

/**
 * Proteção dos formulários sem login (oração, visita, inscrição e doação).
 * Toda server action pública chama `protegerEnvioPublico` ANTES de gravar.
 *
 * Só funciona porque o banco aceita esses envios apenas do servidor
 * (service_role, migration 20261005150000): com a chave pública ninguém
 * grava direto, então não há como contornar o que está aqui.
 *
 * Em produção os limites dependem de RATE_LIMIT_STORE=redis: em memória,
 * cada instância do servidor conta separado.
 */

export type FormularioPublico = "oracao" | "visita" | "evento" | "doacao" | "venda";

/** Teste automático: sem tempo mínimo e com limites folgados (ver PUBLIC_FORMS_RELAXED). */
const relaxado = getServerEnv().PUBLIC_FORMS_RELAXED === "true";

/** Por pessoa (endereço de internet), em cada formulário: 5 envios a cada 10 minutos. */
const porPessoa = createRateLimiter({ limit: relaxado ? 1000 : 5, windowMs: 10 * 60_000 });
/**
 * Por destino (a igreja, o evento ou a campanha): 60 por hora. É o teto para
 * um ataque vindo de muitos endereços ao mesmo tempo — bem acima do uso de
 * verdade, mesmo num domingo de campanha.
 */
const porDestino = createRateLimiter({ limit: relaxado ? 1000 : 60, windowMs: 60 * 60_000 });

/**
 * Devolve `robo: true` quando o envio tem cara de robô: a action então
 * responde como se tivesse dado certo e NÃO grava. Estourar o limite de
 * envios lança AppError("rate_limited"), que a tela mostra para a pessoa.
 */
export async function protegerEnvioPublico(
  formulario: FormularioPublico,
  destinoId: string,
  formData: FormData,
): Promise<{ robo: boolean }> {
  // Relaxado: a isca continua valendo; só o tempo mínimo deixa de contar.
  const iniciadoEm = relaxado ? null : formData.get(CAMPO_INICIO);
  if (pareceRobo({ isca: formData.get(CAMPO_ISCA), iniciadoEm }, Date.now())) {
    console.warn(`[publico] envio com cara de robô barrado (${formulario})`);
    return { robo: true };
  }
  const ip = ipDoPedido(await headers());
  await porPessoa.consume(`publico:${formulario}:ip:${ip}`);
  await porDestino.consume(`publico:${formulario}:destino:${destinoId}`);
  return { robo: false };
}
