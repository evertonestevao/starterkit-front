import type { ChurchTipo } from "@/types/database";

/**
 * Nomes dos níveis da rede de igrejas. A estrutura é fixa (sede → subsede →
 * congregação, em `churches.tipo`); o NOME de cada nível é da rede: a sede
 * pode trocar "Subsede" por "Filial", "Campo", "Setor"...
 *
 * Toda tela que escreve o nome de um nível usa `nomeNivel` com os nomes da
 * rede — nunca o texto fixo. Sem I/O.
 */

export interface NomeNivel {
  singular: string;
  plural: string;
}

export type NomesNiveis = Record<ChurchTipo, NomeNivel>;

/** Do topo para baixo: nível 1, 2 e 3. */
export const NIVEIS: ChurchTipo[] = ["sede", "subsede", "congregacao"];

/** O padrão da plataforma, e o de toda rede que não configurou os seus. */
export const NOMES_PADRAO: NomesNiveis = {
  sede: { singular: "Sede", plural: "Sedes" },
  subsede: { singular: "Subsede", plural: "Subsedes" },
  congregacao: { singular: "Congregação", plural: "Congregações" },
};

export const NOME_NIVEL_MIN = 2;
export const NOME_NIVEL_MAX = 30;

/**
 * O nome de um nível. Com `quantidade`, escolhe singular ou plural (1 = singular);
 * `minusculo` é para o meio de frase ("agora é filial de...").
 */
export function nomeNivel(
  nomes: NomesNiveis,
  tipo: ChurchTipo,
  opcoes: { plural?: boolean; quantidade?: number; minusculo?: boolean } = {},
): string {
  const plural = opcoes.quantidade !== undefined ? opcoes.quantidade !== 1 : Boolean(opcoes.plural);
  const texto = plural ? nomes[tipo].plural : nomes[tipo].singular;
  return opcoes.minusculo ? texto.toLocaleLowerCase("pt-BR") : texto;
}

/** "3 filiais", "1 filial". */
export function contarNivel(nomes: NomesNiveis, tipo: ChurchTipo, quantidade: number): string {
  return `${quantidade} ${nomeNivel(nomes, tipo, { quantidade, minusculo: true })}`;
}

/** A rede usa os nomes padrão? (a tela esconde o "restaurar" quando sim) */
export function saoNomesPadrao(nomes: NomesNiveis): boolean {
  return NIVEIS.every(
    (n) => nomes[n].singular === NOMES_PADRAO[n].singular && nomes[n].plural === NOMES_PADRAO[n].plural,
  );
}
