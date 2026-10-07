import { describe, expect, it } from "vitest";
import type { CultoOpcao, Lancamento } from "@/types/tesouraria";
import {
  agruparPorCulto,
  agruparPorDizimista,
  cultosDaData,
  filtrarLancamentos,
  filtrosParaUrl,
  intervaloDoMes,
  lancamentosParaCsv,
  lerFiltros,
  mesVizinho,
  nomeDoMes,
  somar,
  somarPorForma,
} from "./tesouraria";

let seq = 0;
const lanc = (over: Partial<Lancamento>): Lancamento => ({
  id: `l${++seq}`,
  data: "2026-10-04",
  scheduleId: null,
  cultoTitulo: "Culto de domingo",
  tipo: "dizimo",
  valorCentavos: 10000,
  forma: "dinheiro",
  membroId: null,
  nome: null,
  observacao: null,
  ...over,
});

const lista = [
  lanc({ nome: "Ana Souza", membroId: "m1", valorCentavos: 20000 }),
  lanc({ nome: "Ana  Souza", membroId: "m1", data: "2026-10-11", valorCentavos: 15000, forma: "pix" }),
  lanc({ nome: "José de fora" }),
  lanc({ nome: "jose de fora", data: "2026-10-11" }),
  lanc({ nome: null, valorCentavos: 5000 }),
  lanc({ tipo: "oferta", valorCentavos: 32050 }),
  lanc({ tipo: "oferta", valorCentavos: 8000, data: "2026-10-07", cultoTitulo: null, forma: "pix" }),
];

describe("período", () => {
  it("intervalo do mês respeita os dias de cada mês", () => {
    expect(intervaloDoMes("2026-10")).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(intervaloDoMes("2026-02")).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
    expect(intervaloDoMes("2028-02").ate).toBe("2028-02-29");
  });

  it("mês vizinho atravessa o ano", () => {
    expect(mesVizinho("2026-01", -1)).toBe("2025-12");
    expect(mesVizinho("2026-12", 1)).toBe("2027-01");
    expect(nomeDoMes("2026-03")).toBe("março de 2026");
  });
});

describe("filtros", () => {
  it("o que vier estranho na URL cai no padrão", () => {
    expect(lerFiltros({ mes: "2026-13", tipo: "saida", forma: "cheque" }, "2026-10-06")).toEqual({
      mes: "2026-10",
      tipo: "todos",
      forma: "todas",
      nome: "",
    });
    expect(lerFiltros({ mes: "2026-09", tipo: "dizimo", forma: "pix", q: " ana " }, "2026-10-06")).toEqual({
      mes: "2026-09",
      tipo: "dizimo",
      forma: "pix",
      nome: "ana",
    });
  });

  it("a URL só leva o que foge do padrão", () => {
    expect(filtrosParaUrl({ mes: "2026-10", tipo: "todos", forma: "todas", nome: "" })).toEqual({
      mes: "2026-10",
      tipo: undefined,
      forma: undefined,
      q: undefined,
    });
  });

  it("filtra por tipo, forma e nome sem ligar para acento e maiúscula", () => {
    expect(filtrarLancamentos(lista, { tipo: "oferta", forma: "todas", nome: "" })).toHaveLength(2);
    expect(filtrarLancamentos(lista, { tipo: "todos", forma: "pix", nome: "" })).toHaveLength(2);
    expect(filtrarLancamentos(lista, { tipo: "dizimo", forma: "todas", nome: "JOSE" })).toHaveLength(2);
    // Filtrar por nome deixa de fora a oferta, que não tem nome.
    expect(
      filtrarLancamentos(lista, { tipo: "todos", forma: "todas", nome: "ana" }).every((l) => l.tipo === "dizimo"),
    ).toBe(true);
  });
});

describe("somas", () => {
  it("separa dízimos e ofertas", () => {
    expect(somar(lista)).toEqual({ dizimos: 60000, ofertas: 40050, total: 100050, quantidade: 7 });
    expect(somar([])).toEqual({ dizimos: 0, ofertas: 0, total: 0, quantidade: 0 });
  });

  it("por forma, só as que têm valor", () => {
    expect(somarPorForma(lista)).toEqual([
      { forma: "dinheiro", total: 77050 },
      { forma: "pix", total: 23000 },
    ]);
  });

  it("uma linha por data e culto, em ordem", () => {
    const linhas = agruparPorCulto(lista);
    expect(linhas.map((l) => [l.data, l.culto, l.dizimos, l.ofertas])).toEqual([
      ["2026-10-04", "Culto de domingo", 35000, 32050],
      ["2026-10-07", null, 0, 8000],
      ["2026-10-11", "Culto de domingo", 25000, 0],
    ]);
  });

  it("dizimistas: junta o membro pelo vínculo, o de fora pelo nome, e deixa o sem nome por último", () => {
    expect(agruparPorDizimista(lista)).toEqual([
      { nome: "Ana Souza", quantidade: 2, total: 35000 },
      { nome: "José de fora", quantidade: 2, total: 20000 },
      { nome: "Sem nome", quantidade: 1, total: 5000 },
    ]);
  });
});

describe("cultosDaData", () => {
  const cultos: CultoOpcao[] = [
    { id: "noite", titulo: "Culto da noite", tipo: "semanal", diaSemana: 0, data: null, hora: "19:00:00" },
    { id: "manha", titulo: "Culto da manhã", tipo: "semanal", diaSemana: 0, data: null, hora: "09:00:00" },
    { id: "quarta", titulo: "Oração", tipo: "semanal", diaSemana: 3, data: null, hora: "19:30:00" },
    { id: "vigilia", titulo: "Vigília", tipo: "especial", diaSemana: null, data: "2026-10-09", hora: "22:00:00" },
  ];

  it("traz os semanais do dia e os especiais da data, por horário", () => {
    // 04/10/2026 é domingo.
    expect(cultosDaData(cultos, "2026-10-04").map((c) => c.id)).toEqual(["manha", "noite"]);
    expect(cultosDaData(cultos, "2026-10-07").map((c) => c.id)).toEqual(["quarta"]);
    expect(cultosDaData(cultos, "2026-10-09").map((c) => c.id)).toEqual(["vigilia"]);
    expect(cultosDaData(cultos, "")).toEqual([]);
  });
});

describe("lancamentosParaCsv", () => {
  it("valor com vírgula, total no fim e fórmula neutralizada", () => {
    const csv = lancamentosParaCsv([lanc({ nome: "=HYPERLINK(1)", valorCentavos: 12345 }), lanc({ tipo: "oferta" })]);
    const linhas = csv.replace("﻿", "").trim().split("\r\n");
    expect(linhas[0]).toBe("Data;Culto;Tipo;Nome;Forma;Valor;Observação");
    expect(linhas[1]).toBe("04/10/2026;Culto de domingo;Dízimo;'=HYPERLINK(1);Dinheiro;123,45;");
    expect(linhas.at(-1)).toBe(";;Total;;;223,45;");
  });
});
