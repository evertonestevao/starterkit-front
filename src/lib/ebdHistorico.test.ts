import { describe, expect, it } from "vitest";
import {
  chamadasDoPeriodo,
  filtrarChamadas,
  periodosDoHistorico,
  resumoDasChamadas,
  type ChamadaDoAluno,
} from "./ebdHistorico";

const aula = (data: string, estado: ChamadaDoAluno["estado"], licao: string | null = null): ChamadaDoAluno => ({
  data,
  estado,
  licao,
  classeNome: "Primários",
});

const AULAS = [
  aula("2026-10-04", "ausente", "Lição 1"),
  aula("2026-09-20", "ausente", "Lição 12 do trimestre"),
  aula("2026-09-13", "presente", "Lição 11 do trimestre"),
  aula("2026-08-30", "justificado"),
  aula("2025-11-09", "presente", "A arca de Noé"),
];
const TRIMESTRES = [
  { id: "t3", nome: "3º trimestre de 2026", inicio: "2026-07-01", fim: "2026-09-30", revista: null },
  { id: "t4", nome: "4º trimestre de 2026", inicio: "2026-10-01", fim: "2026-12-31", revista: null },
  { id: "t1", nome: "1º trimestre de 2026", inicio: "2026-01-01", fim: "2026-03-31", revista: null },
];

describe("histórico do aluno", () => {
  it("períodos: 90 dias, trimestres e anos com chamada, e tudo", () => {
    const p = periodosDoHistorico(AULAS, TRIMESTRES, "2026-10-12");
    expect(p.map((x) => x.rotulo)).toEqual([
      "Últimos 90 dias",
      "4º trimestre de 2026",
      "3º trimestre de 2026",
      "Ano de 2026",
      "Ano de 2025",
      "Todo o histórico",
    ]);
    expect(p[0]).toMatchObject({ de: "2026-07-14", ate: "2026-10-12" });
  });

  it("recorta pelo período e resume sem contar a justificada na frequência", () => {
    const noTrimestre = chamadasDoPeriodo(AULAS, { de: "2026-07-01", ate: "2026-09-30" });
    expect(noTrimestre.map((a) => a.data)).toEqual(["2026-09-20", "2026-09-13", "2026-08-30"]);
    expect(resumoDasChamadas(noTrimestre)).toEqual({ presentes: 1, faltas: 1, justificadas: 1, percentual: 50 });
    expect(chamadasDoPeriodo(AULAS, { de: null, ate: null })).toHaveLength(5);
    expect(resumoDasChamadas([]).percentual).toBeNull();
  });

  it("filtra por situação e busca o dia ou a lição", () => {
    expect(filtrarChamadas(AULAS, { estado: "ausente", busca: "" })).toHaveLength(2);
    expect(filtrarChamadas(AULAS, { estado: "", busca: "04/10" }).map((a) => a.data)).toEqual(["2026-10-04"]);
    expect(filtrarChamadas(AULAS, { estado: "", busca: "09/2026" })).toHaveLength(2);
    expect(filtrarChamadas(AULAS, { estado: "", busca: "arca de noe" }).map((a) => a.data)).toEqual(["2025-11-09"]);
    expect(filtrarChamadas(AULAS, { estado: "presente", busca: "09/2026" }).map((a) => a.data)).toEqual(["2026-09-13"]);
  });
});
