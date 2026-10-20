/**
 * Normaliza texto para busca: sem acento, minúsculo, sem espaço nas pontas —
 * "graca" acha "Graça". Usado em toda busca por nome feita no client (sem
 * round-trip ao banco), para o mesmo critério valer em todas.
 */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
