import { NOMES_PADRAO, contarNivel, nomeNivel, type NomesNiveis } from "@/lib/niveisRede";
import { formatChurchName } from "@/lib/churchName";
import { normalizeSearch } from "@/lib/search";
import type { ChurchLinkNode } from "@/types/churchLinks";

/**
 * A rede de uma igreja para ser lida de relance, sem I/O: cada igreja ligada
 * diretamente, com as congregações que ela mesma tem. Com 100 subsedes de 3
 * congregações cada, a tela precisa de contagem, busca e ordenação — não de um
 * desenho com 400 caixas.
 */

export interface NetworkEntry {
  church: ChurchLinkNode;
  /** Congregações ligadas a esta igreja (só uma subsede tem). */
  congregacoes: ChurchLinkNode[];
}

export type NetworkSort = "nome" | "congregacoes";

/** Uma linha por igreja ligada diretamente, na ordem em que vieram (já por nome). */
export function buildNetwork(
  children: ChurchLinkNode[],
  congregacoesPorIgreja: Record<string, ChurchLinkNode[]>,
): NetworkEntry[] {
  return children.map((church) => ({ church, congregacoes: congregacoesPorIgreja[church.id] ?? [] }));
}

/** "3 congregações", "1 congregação" ou "Sem congregações": o texto da badge da subsede. */
export function describeCongregations(n: number, nomes: NomesNiveis = NOMES_PADRAO): string {
  return n === 0
    ? `Sem ${nomeNivel(nomes, "congregacao", { plural: true, minusculo: true })}`
    : contarNivel(nomes, "congregacao", n);
}

/** Totais da rede: as subsedes, e todas as congregações (as ligadas direto e as de cada subsede). */
export function summarizeNetwork(
  entries: NetworkEntry[],
  nomes: NomesNiveis = NOMES_PADRAO,
): { subsedes: number; congregacoes: number; text: string } {
  let subsedes = 0;
  let congregacoes = 0;
  for (const { church, congregacoes: filhas } of entries) {
    if (church.tipo === "subsede") subsedes += 1;
    else congregacoes += 1;
    congregacoes += filhas.length;
  }
  const partes: string[] = [];
  if (subsedes > 0) partes.push(contarNivel(nomes, "subsede", subsedes));
  if (congregacoes > 0) partes.push(contarNivel(nomes, "congregacao", congregacoes));
  return { subsedes, congregacoes, text: partes.join(" · ") };
}

/** Nome do Pastor por id de igreja (cargos registrados). */
export type PastorsByChurch = Record<string, string>;

function matches(church: ChurchLinkNode, query: string, pastores: PastorsByChurch): boolean {
  if (normalizeSearch(formatChurchName(church.name, church.sobrenome)).includes(query)) return true;
  const pastor = pastores[church.id];
  return pastor !== undefined && normalizeSearch(pastor).includes(query);
}

export interface NetworkMatch {
  entry: NetworkEntry;
  /** Congregações que bateram com a busca (quando o nome da própria igreja não bateu). */
  nested: ChurchLinkNode[];
}

/**
 * Busca pelo nome da igreja, de qualquer congregação dela ou do Pastor de
 * cada uma ("onde está o pastor João?"). Busca vazia devolve tudo.
 */
export function filterNetwork(entries: NetworkEntry[], rawQuery: string, pastores: PastorsByChurch = {}): NetworkMatch[] {
  const query = normalizeSearch(rawQuery);
  if (query === "") return entries.map((entry) => ({ entry, nested: [] }));

  const result: NetworkMatch[] = [];
  for (const entry of entries) {
    if (matches(entry.church, query, pastores)) {
      result.push({ entry, nested: [] });
      continue;
    }
    const nested = entry.congregacoes.filter((c) => matches(c, query, pastores));
    if (nested.length > 0) result.push({ entry, nested });
  }
  return result;
}

/** Por nome (o padrão) ou pelas que têm mais congregações primeiro, desempatando por nome. */
export function sortNetwork(matches: NetworkMatch[], sort: NetworkSort): NetworkMatch[] {
  const porNome = (a: NetworkMatch, b: NetworkMatch) =>
    formatChurchName(a.entry.church.name, a.entry.church.sobrenome).localeCompare(
      formatChurchName(b.entry.church.name, b.entry.church.sobrenome),
      "pt-BR",
    );
  return [...matches].sort(
    sort === "congregacoes"
      ? (a, b) => b.entry.congregacoes.length - a.entry.congregacoes.length || porNome(a, b)
      : porNome,
  );
}
