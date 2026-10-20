/**
 * Paginação de uma lista que já está inteira na memória (alunos de uma EBD,
 * campanhas de uma igreja...). Listas que crescem sem teto — membros, eventos,
 * auditoria — paginam no banco, não aqui.
 */
export interface Pagina<T> {
  itens: T[];
  /** Página de fato mostrada (a pedida, ajustada ao que existe). */
  pagina: number;
  totalPaginas: number;
  total: number;
}

export function paginar<T>(lista: readonly T[], pagina: number, tamanho: number): Pagina<T> {
  const totalPaginas = Math.max(1, Math.ceil(lista.length / tamanho));
  // Página pedida além do fim (filtro mudou, item removido) cai na última.
  const atual = Math.min(Math.max(1, Math.trunc(pagina) || 1), totalPaginas);
  return {
    itens: lista.slice((atual - 1) * tamanho, atual * tamanho),
    pagina: atual,
    totalPaginas,
    total: lista.length,
  };
}

/** Lê o `?page=` da URL; qualquer coisa que não seja um inteiro positivo vira 1. */
export function paginaDaUrl(valor: string | string[] | undefined): number {
  const n = Number(Array.isArray(valor) ? valor[0] : valor);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
