/**
 * Saudação que abre as mensagens prontas (WhatsApp e e-mail de convite). Cada
 * igreja escolhe a sua em Configurações; nenhuma mensagem escreve a saudação
 * direto no texto — todas passam por `saudar`. Sem I/O.
 */

export const SAUDACAO_PADRAO = "A paz do Senhor";
export const SAUDACAO_MIN = 2;
export const SAUDACAO_MAX = 40;

/** Sugestões que a tela oferece; a igreja pode escrever outra. */
export const SAUDACOES_SUGERIDAS = ["A paz do Senhor", "Graça e paz", "Paz e bem", "Olá"];

/** Tira espaços sobrando e a pontuação do fim: o "!" e a vírgula são postos por `saudar`. */
export function limparSaudacao(texto: string): string {
  return texto
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s!.,;:]+$/, "");
}

/** "A paz do Senhor, Ana!" (com o primeiro nome) ou "A paz do Senhor!". */
export function saudar(saudacao: string | null | undefined, nome?: string | null): string {
  const base = limparSaudacao(saudacao ?? "") || SAUDACAO_PADRAO;
  const primeiro = nome?.trim().split(/\s+/)[0];
  return primeiro ? `${base}, ${primeiro}!` : `${base}!`;
}
