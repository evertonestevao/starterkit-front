/**
 * Barreira contra robôs nos formulários públicos, sem captcha: nada muda
 * para quem preenche de verdade. Lógica pura; o servidor aplica.
 *
 *  - CAMPO_ISCA: um campo que a pessoa não vê. Robô que preenche tudo o que
 *    encontra o preenche; gente, nunca.
 *  - CAMPO_INICIO: a hora em que o formulário apareceu na tela. Enviar em
 *    menos de dois segundos não é coisa de gente.
 *
 * Quem cai aqui recebe a mesma resposta de sucesso de um envio normal — sem
 * pista de que foi barrado — e nada é gravado.
 */

/** Nome sem cara de campo conhecido, para o navegador não preencher sozinho. */
export const CAMPO_ISCA = "confirmacao_extra";
export const CAMPO_INICIO = "form_iniciado";

/** Tempo mínimo entre o formulário aparecer e ser enviado. */
export const TEMPO_MINIMO_MS = 2000;

export function pareceRobo(
  campos: { isca: unknown; iniciadoEm: unknown },
  agora: number,
): boolean {
  if (typeof campos.isca === "string" && campos.isca.trim() !== "") return true;
  // Sem a hora (navegador sem JavaScript): não dá para medir, então não barra por isso.
  if (typeof campos.iniciadoEm !== "string" || campos.iniciadoEm === "") return false;
  const inicio = Number(campos.iniciadoEm);
  // Valor que não é número, ou "do futuro": alguém mexeu no campo.
  if (!Number.isFinite(inicio) || inicio > agora + 60_000) return true;
  return agora - inicio < TEMPO_MINIMO_MS;
}

/** Endereço de quem envia, a partir dos cabeçalhos do proxy. */
export function ipDoPedido(cabecalhos: { get(nome: string): string | null }): string {
  const encaminhado = cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim();
  return encaminhado || cabecalhos.get("x-real-ip")?.trim() || "desconhecido";
}
