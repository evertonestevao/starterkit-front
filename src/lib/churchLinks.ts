import { NOMES_PADRAO, nomeNivel, type NomesNiveis } from "@/lib/niveisRede";
import type { ChurchTipo } from "@/types/database";
import type { ChurchLinkTipo } from "@/types/churchLinks";

/**
 * Regras do vínculo entre igrejas (sem I/O). O banco confere tudo de novo — é
 * ele que decide —, mas a tela precisa saber o que oferecer.
 */

/**
 * Validades que a igreja pode escolher ao gerar o link. Não há padrão: quem
 * gera decide. `null` = o link não expira (fica aberto até ser cancelado).
 */
export const CHURCH_LINK_VALIDITY_OPTIONS = [7, 15, 30, null] as const;
export type ChurchLinkValidity = (typeof CHURCH_LINK_VALIDITY_OPTIONS)[number];

/** Teto do número de pedidos de um link com limite; sem limite é `null`. */
export const CHURCH_LINK_MAX_USES_LIMIT = 1000;

/** Até quando o link vale, a partir de agora; null = não expira. */
export function linkExpiration(validityDays: ChurchLinkValidity, now: Date): string | null {
  return validityDays === null ? null : new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString();
}

export function describeValidity(validityDays: ChurchLinkValidity): string {
  return validityDays === null ? "Sem validade" : `${validityDays} dias`;
}

export function churchLinkPath(token: string): string {
  return `/vinculo/${encodeURIComponent(token)}`;
}

/**
 * O caminho de retorno depois de cadastrar a igreja (quem chegou por um link e
 * ainda não tinha conta). Só aceita `/vinculo/<token>`: qualquer outra coisa
 * (URL absoluta, `//host`, outro caminho) é descartada — nada de open redirect.
 */
export function safeChurchLinkPath(value: unknown): string | null {
  return typeof value === "string" && /^\/vinculo\/[A-Za-z0-9_%-]{20,300}$/.test(value) ? value : null;
}

/**
 * O que esta igreja pode oferecer em um link. Congregação não tem igrejas
 * abaixo; só uma igreja SEM superior pode ter subsedes (subsede de subsede não
 * existe); com superior, só congregações.
 */
export function inviteOptions(church: { tipo: ChurchTipo; parentId: string | null }): ChurchLinkTipo[] {
  if (church.tipo === "congregacao") return [];
  return church.parentId === null ? ["subsede", "congregacao"] : ["congregacao"];
}

/**
 * Para onde a superior pode mover uma igreja abaixo dela: para debaixo dela
 * mesma, ou de uma das subsedes dela (quando ela é a sede da árvore). A
 * posição em cada destino: sob a sede, subsede ou congregação; sob uma
 * subsede, só congregação.
 */
export function moveDestinations(
  parent: { id: string; tipo: ChurchTipo; parentId: string | null },
  children: Array<{ id: string; tipo: ChurchTipo }>,
  moving: { id: string },
): Array<{ parentId: string; tipos: ChurchLinkTipo[] }> {
  const destinos: Array<{ parentId: string; tipos: ChurchLinkTipo[] }> = [];
  if (parent.tipo !== "congregacao") {
    destinos.push({ parentId: parent.id, tipos: inviteOptions(parent) });
  }
  // Só a sede da árvore (sem superior) tem subsedes, e só as subsedes recebem congregações.
  if (parent.parentId === null) {
    for (const filha of children) {
      if (filha.id !== moving.id && filha.tipo === "subsede") {
        destinos.push({ parentId: filha.id, tipos: ["congregacao"] });
      }
    }
  }
  return destinos.filter((d) => d.tipos.length > 0);
}

/** A frase do que aconteceu, do ponto de vista de quem NÃO decidiu. */
export function describeApproved(input: {
  parentName: string;
  childName: string;
  tipo: ChurchLinkTipo;
  /** Como a rede chama os níveis; sem informar, os nomes padrão. */
  nomes?: NomesNiveis;
}): string {
  const funcao = nomeNivel(input.nomes ?? NOMES_PADRAO, input.tipo, { minusculo: true });
  return `${input.childName} agora é ${funcao} de ${input.parentName}.`;
}

/**
 * O que a superior passa a enxergar da igreja de baixo. Mostrado antes de
 * pedir o vínculo: é a informação que a decisão precisa (e que a LGPD pede que
 * fique explícita).
 */
export const LINK_VISIBILITY_NOTES: readonly string[] = [
  "Nada muda até a igreja que enviou o link aprovar o seu pedido. Ela pode aprovar, ajustar a sua função ou recusar.",
  "Depois de aprovado, a igreja-mãe passa a ver a contagem de pedidos de oração e de visitas da sua igreja. O texto dos pedidos continua só seu.",
  "Se a sua página estiver como “igual à igreja-mãe”, ela passa a seguir o tema e a cor da igreja-mãe. Usar o nome dela é uma escolha sua.",
  "Qualquer das duas igrejas pode desfazer o vínculo quando quiser.",
];
