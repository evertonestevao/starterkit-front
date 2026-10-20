import { describe, expect, it } from "vitest";
import type { EbdFrequenciaAluno, EbdRelatorioClasse } from "@/types/ebd";
import {
  liderEm,
  minimoDeChamadas,
  periodoDestaque,
  podioDeAlunos,
  posicoesComEmpate,
  rankingDeClasses,
  totaisDoPeriodo,
  trimestresRecentes,
  variacao,
} from "./ebdDestaques";

const classe = (nome: string, over: Partial<EbdRelatorioClasse>): EbdRelatorioClasse => ({
  classeId: nome,
  classeNome: nome,
  aulas: 0,
  presentes: 0,
  ausentes: 0,
  justificados: 0,
  visitantes: 0,
  biblias: 0,
  revistas: 0,
  ofertaCentavos: 0,
  matriculadosHoje: 0,
  ...over,
});

const aluno = (nome: string, presentes: number, ausentes: number, classeNome = "Adultos"): EbdFrequenciaAluno => ({
  membroId: nome,
  nome,
  membroIgreja: true,
  classeId: classeNome,
  classeNome,
  matriculadoHoje: true,
  presentes,
  ausentes,
  justificados: 0,
  percentual: presentes + ausentes > 0 ? Math.round((presentes / (presentes + ausentes)) * 1000) / 10 : null,
});

const T3 = { id: "t3", nome: "3º trimestre de 2026", inicio: "2026-07-01", fim: "2026-09-30", revista: "Lições Bíblicas" };
const T4 = { id: "t4", nome: "4º trimestre de 2026", inicio: "2026-10-01", fim: "2026-12-31", revista: null };

describe("periodoDestaque", () => {
  it("sem pedir nada, mostra o trimestre da data e compara com o cadastrado antes", () => {
    expect(periodoDestaque([T3, T4], undefined, "2026-10-04")).toMatchObject({
      id: "t4",
      de: "2026-10-01",
      ate: "2026-12-31",
      anterior: { nome: "3º trimestre de 2026", de: "2026-07-01", ate: "2026-09-30" },
    });
  });

  it("o trimestre pedido vence; sem um cadastrado antes, compara com o do calendário", () => {
    expect(periodoDestaque([T3, T4], "t3", "2026-10-04")).toMatchObject({
      id: "t3",
      revista: "Lições Bíblicas",
      anterior: { nome: "2º trimestre de 2026", de: "2026-04-01", ate: "2026-06-30" },
    });
  });

  it("data fora de qualquer trimestre cadastrado cai no mais recente já começado", () => {
    expect(periodoDestaque([T3], undefined, "2026-11-10").id).toBe("t3");
    expect(periodoDestaque([T3, T4], "nao-existe", "2026-08-15").id).toBe("t3");
  });

  it("igreja sem trimestre cadastrado usa o do calendário", () => {
    expect(periodoDestaque([], undefined, "2026-02-10")).toMatchObject({
      id: null,
      nome: "1º trimestre de 2026",
      de: "2026-01-01",
      ate: "2026-03-31",
      anterior: { nome: "4º trimestre de 2025", de: "2025-10-01", ate: "2025-12-31" },
    });
  });

  it("o seletor lista do mais recente para o mais antigo", () => {
    expect(trimestresRecentes([T3, T4]).map((t) => t.id)).toEqual(["t4", "t3"]);
  });
});

describe("classes", () => {
  const classes = [
    classe("Adultos", { aulas: 6, presentes: 44, ausentes: 13, visitantes: 2, ofertaCentavos: 30750 }),
    classe("Jovens", { aulas: 6, presentes: 23, ausentes: 5, visitantes: 5, ofertaCentavos: 7200 }),
    classe("Berçário", { aulas: 0 }),
  ];

  it("ranking por presença, sem as classes que não tiveram aula", () => {
    const ranking = rankingDeClasses(classes);
    expect(ranking.map((c) => c.nome)).toEqual(["Jovens", "Adultos"]);
    expect(ranking[0]).toMatchObject({ presenca: 82.1, mediaPresentes: 3.8 });
  });

  it("líder por critério; ninguém lidera se tudo é zero", () => {
    const ranking = rankingDeClasses(classes);
    expect(liderEm(ranking, (c) => c.visitantes)?.nome).toBe("Jovens");
    expect(liderEm(ranking, (c) => c.ofertaCentavos)?.nome).toBe("Adultos");
    expect(liderEm(rankingDeClasses([classe("X", { aulas: 2, presentes: 3 })]), (c) => c.visitantes)).toBeNull();
  });

  it("totais do período somam os domingos", () => {
    const t = totaisDoPeriodo(classes, [
      { data: "2026-09-20", presentes: 18, ausentes: 4, justificados: 1, visitantes: 2 },
      { data: "2026-09-27", presentes: 20, ausentes: 2, justificados: 0, visitantes: 1 },
    ]);
    expect(t).toMatchObject({ domingos: 2, presenca: 86.4, mediaPresentes: 19, visitantes: 3, ofertaCentavos: 37950 });
    expect(totaisDoPeriodo([], [])).toMatchObject({ presenca: null, mediaPresentes: null });
  });
});

describe("pódio dos mais assíduos", () => {
  const nomes = (lugar: { alunos: Array<{ nome: string }> }) => lugar.alunos.map((a) => a.nome);

  it("um lugar por percentual, com todos os empatados dentro", () => {
    const { lugares, elegiveis } = podioDeAlunos([
      aluno("Glória", 6, 0),
      aluno("Pedro", 6, 0),
      aluno("Davi", 5, 1),
      aluno("Helena", 5, 1),
      aluno("Ana Clara", 4, 2),
      aluno("Miguel", 3, 3), // 4º lugar: fora do pódio
    ]);
    expect(lugares.map((l) => [l.posicao, l.percentual, nomes(l)])).toEqual([
      [1, 100, ["Glória", "Pedro"]],
      [2, 83.3, ["Davi", "Helena"]],
      [3, 66.7, ["Ana Clara"]],
    ]);
    expect(elegiveis).toBe(6);
  });

  it("empate grande não é cortado: todos entram no lugar", () => {
    const quinze = Array.from({ length: 15 }, (_, i) => aluno(`Aluno ${String(i).padStart(2, "0")}`, 5, 1));
    const { lugares } = podioDeAlunos(quinze);
    expect(lugares).toHaveLength(1);
    expect(lugares[0].alunos).toHaveLength(15);
  });

  it("exige um mínimo de chamadas, para uma aula só não valer 100%", () => {
    const alunos = [aluno("Ana", 10, 0), aluno("Beto", 9, 1), aluno("Caio", 1, 0), aluno("Sem aula", 0, 0)];
    expect(minimoDeChamadas(alunos)).toBe(5);
    expect(minimoDeChamadas([aluno("X", 2, 0)])).toBe(3);
    const { lugares, minimo } = podioDeAlunos(alunos);
    expect(minimo).toBe(5);
    expect(lugares.map((l) => nomes(l))).toEqual([["Ana"], ["Beto"]]);
  });

  it("aluno que passou por duas classes aparece uma vez, pela melhor marca", () => {
    const { lugares } = podioDeAlunos([aluno("Ana", 4, 2, "Juniores"), aluno("Ana", 6, 0, "Adolescentes")]);
    expect(lugares).toHaveLength(1);
    expect(lugares[0]).toMatchObject({ percentual: 100, alunos: [{ classeNome: "Adolescentes" }] });
  });

  it("sem ninguém com chamadas suficientes, não há pódio", () => {
    expect(podioDeAlunos([aluno("Ana", 1, 0)]).lugares).toEqual([]);
  });
});

describe("empates", () => {
  it("valores iguais dividem a posição, e a seguinte continua em sequência", () => {
    expect(posicoesComEmpate([90, 80, 80, 80, 70])).toEqual([1, 2, 2, 2, 3]);
    expect(posicoesComEmpate([])).toEqual([]);
  });

  it("classes empatadas em presença dividem a posição", () => {
    const ranking = rankingDeClasses([
      classe("A", { aulas: 4, presentes: 8, ausentes: 2 }),
      classe("B", { aulas: 4, presentes: 8, ausentes: 2 }),
      classe("C", { aulas: 4, presentes: 5, ausentes: 5 }),
    ]);
    expect(ranking.map((c) => c.posicao)).toEqual([1, 1, 2]);
  });
});

describe("variacao", () => {
  it("diferença em pontos; sem dado em um dos lados, não compara", () => {
    expect(variacao(81.8, 77.2)).toBe(4.6);
    expect(variacao(70, 75.5)).toBe(-5.5);
    expect(variacao(null, 75)).toBeNull();
    expect(variacao(80, null)).toBeNull();
  });
});
