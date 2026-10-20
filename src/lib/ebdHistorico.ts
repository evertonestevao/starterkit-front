import { formatarData, somarDias } from "@/lib/acompanhamento";
import { normalizeSearch } from "@/lib/search";
import type { EstadoPresenca } from "@/types/acompanhamento";
import type { EbdHistoricoDoAluno, EbdTrimestre } from "@/types/ebd";

/** Página do aluno: períodos, filtros e resumo das chamadas (tudo no navegador). */

export type ChamadaDoAluno = EbdHistoricoDoAluno["aulas"][number];

export interface PeriodoDoHistorico {
  id: string;
  rotulo: string;
  /** AAAA-MM-DD; null = sem limite. */
  de: string | null;
  ate: string | null;
}

/** Mesmo período do selo da lista de alunos. */
export const PERIODO_PADRAO = "90d";

/**
 * Períodos para escolher: os últimos 90 dias (o do selo da lista), cada
 * trimestre e cada ano em que o aluno teve chamada, e o histórico todo.
 */
export function periodosDoHistorico(
  aulas: readonly ChamadaDoAluno[],
  trimestres: readonly EbdTrimestre[],
  hoje: string,
): PeriodoDoHistorico[] {
  const comChamada = (de: string, ate: string) => aulas.some((a) => a.data >= de && a.data <= ate);
  const anos = [...new Set(aulas.map((a) => a.data.slice(0, 4)))].sort().reverse();
  return [
    { id: PERIODO_PADRAO, rotulo: "Últimos 90 dias", de: somarDias(hoje, -90), ate: hoje },
    ...[...trimestres]
      .filter((t) => comChamada(t.inicio, t.fim))
      .sort((a, b) => b.inicio.localeCompare(a.inicio))
      .map((t) => ({ id: `t:${t.id}`, rotulo: t.nome, de: t.inicio, ate: t.fim })),
    ...anos.map((ano) => ({ id: `a:${ano}`, rotulo: `Ano de ${ano}`, de: `${ano}-01-01`, ate: `${ano}-12-31` })),
    { id: "tudo", rotulo: "Todo o histórico", de: null, ate: null },
  ];
}

export function chamadasDoPeriodo(
  aulas: readonly ChamadaDoAluno[],
  periodo: Pick<PeriodoDoHistorico, "de" | "ate">,
): ChamadaDoAluno[] {
  return aulas.filter((a) => (!periodo.de || a.data >= periodo.de) && (!periodo.ate || a.data <= periodo.ate));
}

/**
 * Filtro da lista: situação e busca. A busca acha o dia ("04/10", "04/10/2026",
 * "10/2026") ou um trecho da lição ou da classe.
 */
export function filtrarChamadas(
  aulas: readonly ChamadaDoAluno[],
  filtro: { estado: EstadoPresenca | ""; busca: string },
): ChamadaDoAluno[] {
  const termo = filtro.busca.trim();
  const texto = normalizeSearch(termo);
  return aulas.filter(
    (a) =>
      (!filtro.estado || a.estado === filtro.estado) &&
      (!termo ||
        formatarData(a.data).includes(termo) ||
        normalizeSearch(`${a.licao ?? ""} ${a.classeNome}`).includes(texto)),
  );
}

/** Presenças, faltas e justificadas; a frequência não conta as justificadas. */
export function resumoDasChamadas(aulas: readonly ChamadaDoAluno[]): {
  presentes: number;
  faltas: number;
  justificadas: number;
  percentual: number | null;
} {
  const presentes = aulas.filter((a) => a.estado === "presente").length;
  const faltas = aulas.filter((a) => a.estado === "ausente").length;
  const justificadas = aulas.filter((a) => a.estado === "justificado").length;
  return {
    presentes,
    faltas,
    justificadas,
    percentual: presentes + faltas > 0 ? (100 * presentes) / (presentes + faltas) : null,
  };
}
