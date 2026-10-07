import { formatarData } from "@/lib/acompanhamento";
import { celulaCsv } from "@/lib/rolMembros";
import { normalizeSearch } from "@/lib/search";
import type { CultoOpcao, FiltrosLancamentos, FormaLancamento, Lancamento, TipoLancamento } from "@/types/tesouraria";

/**
 * Tesouraria: regras puras (sem I/O) dos dízimos e ofertas — filtros, somas
 * do relatório mensal e a planilha.
 */

export const TIPO_LABEL: Record<TipoLancamento, string> = { dizimo: "Dízimo", oferta: "Oferta" };
export const FORMA_LABEL: Record<FormaLancamento, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao: "Cartão",
  outro: "Outro",
};
export const TIPOS: TipoLancamento[] = ["dizimo", "oferta"];
export const FORMAS: FormaLancamento[] = ["dinheiro", "pix", "cartao", "outro"];

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatarValor(centavos: number): string {
  return reais.format(centavos / 100);
}

// ------------------------------------------------------------------- período
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "AAAA-MM" de uma data AAAA-MM-DD. */
export function mesDe(dataISO: string): string {
  return dataISO.slice(0, 7);
}

/** Primeiro e último dia do mês "AAAA-MM". */
export function intervaloDoMes(mes: string): { de: string; ate: string } {
  const [ano, m] = mes.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "outubro de 2026". */
export function nomeDoMes(mes: string): string {
  const [ano, m] = mes.split("-").map(Number) as [number, number];
  return `${MESES[m - 1]} de ${ano}`;
}

/** Mês vizinho: `passo` -1 = anterior, +1 = seguinte. */
export function mesVizinho(mes: string, passo: number): string {
  const [ano, m] = mes.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(ano, m - 1 + passo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ------------------------------------------------------------------- filtros
type Param = string | string[] | undefined | null;
const um = (v: Param) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Filtros da URL; o que vier fora do esperado cai no padrão (mês atual, tudo). */
export function lerFiltros(
  params: { mes?: Param; tipo?: Param; forma?: Param; q?: Param },
  hoje: string,
): FiltrosLancamentos {
  const mes = um(params.mes);
  const tipo = um(params.tipo);
  const forma = um(params.forma);
  return {
    mes: MES_RE.test(mes) ? mes : mesDe(hoje),
    tipo: (TIPOS as string[]).includes(tipo) ? (tipo as TipoLancamento) : "todos",
    forma: (FORMAS as string[]).includes(forma) ? (forma as FormaLancamento) : "todas",
    nome: um(params.q).trim().slice(0, 80),
  };
}

/** Só os filtros diferentes do padrão, para montar links (paginação, exportar). */
export function filtrosParaUrl(f: FiltrosLancamentos): Record<string, string | undefined> {
  return {
    mes: f.mes,
    tipo: f.tipo === "todos" ? undefined : f.tipo,
    forma: f.forma === "todas" ? undefined : f.forma,
    q: f.nome || undefined,
  };
}

/** Aplica tipo, forma e nome (o mês já vem filtrado do banco). */
export function filtrarLancamentos(lista: Lancamento[], f: Pick<FiltrosLancamentos, "tipo" | "forma" | "nome">) {
  const termo = normalizeSearch(f.nome);
  return lista.filter(
    (l) =>
      (f.tipo === "todos" || l.tipo === f.tipo) &&
      (f.forma === "todas" || l.forma === f.forma) &&
      (!termo || normalizeSearch(l.nome ?? "").includes(termo)),
  );
}

// -------------------------------------------------------------------- somas
export interface Totais {
  dizimos: number;
  ofertas: number;
  total: number;
  quantidade: number;
}

export function somar(lista: Lancamento[]): Totais {
  let dizimos = 0;
  let ofertas = 0;
  for (const l of lista) {
    if (l.tipo === "dizimo") dizimos += l.valorCentavos;
    else ofertas += l.valorCentavos;
  }
  return { dizimos, ofertas, total: dizimos + ofertas, quantidade: lista.length };
}

/** Total por forma de recebimento, só das que têm valor. */
export function somarPorForma(lista: Lancamento[]): Array<{ forma: FormaLancamento; total: number }> {
  const mapa = new Map<FormaLancamento, number>();
  for (const l of lista) mapa.set(l.forma, (mapa.get(l.forma) ?? 0) + l.valorCentavos);
  return FORMAS.filter((f) => mapa.has(f)).map((forma) => ({ forma, total: mapa.get(forma) ?? 0 }));
}

export interface LinhaPorCulto extends Totais {
  data: string;
  culto: string | null;
}

/** Uma linha por data + culto, em ordem de data: o "caixa" de cada culto. */
export function agruparPorCulto(lista: Lancamento[]): LinhaPorCulto[] {
  const grupos = new Map<string, Lancamento[]>();
  for (const l of lista) {
    const chave = `${l.data}|${l.cultoTitulo ?? ""}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), l]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, itens]) => ({ data: itens[0]!.data, culto: itens[0]!.cultoTitulo, ...somar(itens) }));
}

export interface LinhaDizimista {
  nome: string;
  quantidade: number;
  total: number;
}

/**
 * Dízimos por pessoa no período, por nome. O mesmo membro lançado com grafias
 * diferentes junta pelo vínculo; quem não é do rol junta pelo nome. Dízimo
 * sem nome vai para uma linha só, no fim.
 */
export function agruparPorDizimista(lista: Lancamento[]): LinhaDizimista[] {
  const SEM_NOME = "￿";
  const grupos = new Map<string, LinhaDizimista>();
  for (const l of lista) {
    if (l.tipo !== "dizimo") continue;
    const chave = l.membroId ?? (l.nome ? `nome:${normalizeSearch(l.nome)}` : SEM_NOME);
    const atual = grupos.get(chave) ?? { nome: l.nome ?? "Sem nome", quantidade: 0, total: 0 };
    grupos.set(chave, { nome: atual.nome, quantidade: atual.quantidade + 1, total: atual.total + l.valorCentavos });
  }
  return [...grupos.entries()]
    .sort(([ca, a], [cb, b]) => (ca === SEM_NOME ? 1 : cb === SEM_NOME ? -1 : a.nome.localeCompare(b.nome, "pt-BR")))
    .map(([, linha]) => linha);
}

// -------------------------------------------------------------------- cultos
/** Dia da semana (0 = domingo) de uma data AAAA-MM-DD, sem fuso. */
export function diaDaSemana(dataISO: string): number {
  const [a, m, d] = dataISO.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Cultos da programação que acontecem na data: os semanais do dia e os especiais da data. */
export function cultosDaData(cultos: CultoOpcao[], dataISO: string): CultoOpcao[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return [];
  const dia = diaDaSemana(dataISO);
  return cultos
    .filter((c) => (c.tipo === "semanal" ? c.diaSemana === dia : c.data === dataISO))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}

// ---------------------------------------------------------------------- CSV
const valorCsv = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

/** Os lançamentos em CSV (ponto e vírgula e BOM: abre direto no Excel em português). */
export function lancamentosParaCsv(lista: Lancamento[]): string {
  const linhas = [
    ["Data", "Culto", "Tipo", "Nome", "Forma", "Valor", "Observação"].join(";"),
    ...lista.map((l) =>
      [
        formatarData(l.data),
        celulaCsv(l.cultoTitulo),
        TIPO_LABEL[l.tipo],
        celulaCsv(l.nome),
        FORMA_LABEL[l.forma],
        valorCsv(l.valorCentavos),
        celulaCsv(l.observacao),
      ].join(";"),
    ),
  ];
  const t = somar(lista);
  linhas.push(["", "", "Total", "", "", valorCsv(t.total), ""].join(";"));
  return `﻿${linhas.join("\r\n")}\r\n`;
}
