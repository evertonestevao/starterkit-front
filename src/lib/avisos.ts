/**
 * Avisos que chegam pela URL (`?aviso=chave`), para o "acabei de fazer
 * algo" que termina num redirect — o servidor não consegue chamar o toast.
 * Só chaves conhecidas: o texto vem daqui, nunca da URL (ninguém monta um
 * link que faça o sistema "dizer" qualquer coisa).
 */
export type TipoDeAviso = "success" | "error" | "info" | "warning";

export const AVISOS = {
  "senha-trocada": { tipo: "success", texto: "Senha trocada. Use a nova no próximo acesso." },
  "igreja-assumida": { tipo: "success", texto: "Pronto! Você agora é o Responsável desta igreja." },
} as const satisfies Record<string, { tipo: TipoDeAviso; texto: string }>;

export type ChaveDeAviso = keyof typeof AVISOS;

export const PARAMETRO_DE_AVISO = "aviso";

/** O aviso de uma chave da URL; null para chave desconhecida ou ausente. */
export function avisoDaChave(chave: string | null): { tipo: TipoDeAviso; texto: string } | null {
  return chave && Object.hasOwn(AVISOS, chave) ? AVISOS[chave as ChaveDeAviso] : null;
}

/** Caminho com o aviso anexado (para usar no redirect). */
export function comAviso(caminho: string, chave: ChaveDeAviso): string {
  return `${caminho}${caminho.includes("?") ? "&" : "?"}${PARAMETRO_DE_AVISO}=${chave}`;
}
