import { describe, expect, it } from "vitest";
import {
  contarEstados,
  contarFaltasSeguidas,
  contarJustificadosSeguidos,
  cultoAconteceEm,
  descreverQuando,
  estadosIniciais,
  hojeISO,
  linkWhatsapp,
  percentualPresenca,
  proximoEstado,
  sugerirChamada,
  telefoneInternacional,
  ultimaOcorrencia,
} from "./acompanhamento";
import type { Culto, Justificativa } from "@/types/acompanhamento";

describe("contarFaltasSeguidas", () => {
  it("falta, falta, justificado, falta = 3", () => {
    expect(contarFaltasSeguidas(["ausente", "ausente", "justificado", "ausente"])).toBe(3);
  });

  it("presente zera", () => {
    expect(contarFaltasSeguidas(["ausente", "ausente", "presente", "ausente"])).toBe(1);
    expect(contarFaltasSeguidas(["ausente", "ausente", "presente"])).toBe(0);
  });

  it("justificado não soma nem zera", () => {
    expect(contarFaltasSeguidas(["ausente", "justificado", "justificado"])).toBe(1);
    expect(contarFaltasSeguidas(["presente", "justificado"])).toBe(0);
  });

  it("sem chamadas = 0", () => {
    expect(contarFaltasSeguidas([])).toBe(0);
  });
});

describe("contarJustificadosSeguidos", () => {
  it("conta só o fim da sequência", () => {
    expect(contarJustificadosSeguidos(["justificado", "ausente", "justificado", "justificado"])).toBe(2);
    expect(contarJustificadosSeguidos(["justificado", "presente"])).toBe(0);
  });
});

describe("percentualPresenca", () => {
  it("ignora os cultos justificados (só presentes + ausentes)", () => {
    expect(percentualPresenca(3, 1)).toBe(75);
    expect(percentualPresenca(0, 0)).toBeNull();
    expect(percentualPresenca(1, 2)).toBe(33.3);
  });
});

const viagem: Justificativa = {
  id: "j1",
  membroId: "m2",
  membroNome: "Maria",
  motivo: "viagem",
  motivoTexto: null,
  dataInicio: "2026-10-10",
  dataFim: "2026-10-25",
  encerradaEm: null,
};

describe("estadosIniciais", () => {
  it("chamada nova: presente por padrão e justificado quando há justificativa no período", () => {
    const estados = estadosIniciais({
      membroIds: ["m1", "m2"],
      data: "2026-10-18",
      presencas: [],
      justificativas: [viagem],
      chamadaExiste: false,
    });
    expect(estados).toEqual({ m1: "presente", m2: "justificado" });
  });

  it("fora do período a justificativa não pré-marca", () => {
    const estados = estadosIniciais({
      membroIds: ["m2"],
      data: "2026-10-26",
      presencas: [],
      justificativas: [viagem],
      chamadaExiste: false,
    });
    expect(estados.m2).toBe("presente");
  });

  it("chamada reaberta mostra o que foi salvo, e ausência coberta vira justificado", () => {
    const estados = estadosIniciais({
      membroIds: ["m1", "m2", "m3"],
      data: "2026-10-18",
      presencas: [
        { membroId: "m1", estado: "presente", justificativaId: null },
        { membroId: "m2", estado: "ausente", justificativaId: null },
      ],
      justificativas: [viagem],
      chamadaExiste: true,
    });
    // m3 entrou no rol depois da chamada: fica ausente até alguém marcar.
    expect(estados).toEqual({ m1: "presente", m2: "justificado", m3: "ausente" });
  });
});

describe("toque na chamada", () => {
  it("cicla presente → ausente → justificado → presente", () => {
    expect(proximoEstado("presente")).toBe("ausente");
    expect(proximoEstado("ausente")).toBe("justificado");
    expect(proximoEstado("justificado")).toBe("presente");
  });

  it("conta os estados", () => {
    expect(contarEstados({ a: "presente", b: "presente", c: "ausente" })).toEqual({
      presente: 2,
      ausente: 1,
      justificado: 0,
    });
  });
});

describe("WhatsApp", () => {
  it("põe DDI 55 em número brasileiro", () => {
    expect(telefoneInternacional("(11) 98888-7777")).toBe("5511988887777");
    expect(telefoneInternacional("+55 11 98888-7777")).toBe("5511988887777");
    expect(telefoneInternacional("1234")).toBeNull();
  });

  it("monta o link wa.me com a mensagem codificada", () => {
    expect(linkWhatsapp("11988887777", "Olá, tudo bem?")).toBe(
      "https://wa.me/5511988887777?text=Ol%C3%A1%2C%20tudo%20bem%3F",
    );
    expect(linkWhatsapp(null, "x")).toBeNull();
  });
});

describe("datas", () => {
  it("hoje no fuso de Brasília", () => {
    // 02:00 UTC de 2/10 ainda é 1/10 em Brasília.
    expect(hojeISO(new Date("2026-10-02T02:00:00Z"))).toBe("2026-10-01");
  });

  it("última ocorrência do culto", () => {
    // 2026-10-01 é quinta-feira.
    expect(ultimaOcorrencia({ tipo: "semanal", diaSemana: 0, data: null }, "2026-10-01")).toBe("2026-09-27");
    expect(ultimaOcorrencia({ tipo: "semanal", diaSemana: 4, data: null }, "2026-10-01")).toBe("2026-10-01");
    expect(ultimaOcorrencia({ tipo: "especial", diaSemana: null, data: "2026-09-20" }, "2026-10-01")).toBe("2026-09-20");
    // Especial ainda por vir não tem chamada.
    expect(ultimaOcorrencia({ tipo: "especial", diaSemana: null, data: "2026-10-12" }, "2026-10-01")).toBeNull();
  });

  it("confere se a data é dia do culto", () => {
    expect(cultoAconteceEm({ tipo: "semanal", diaSemana: 0, data: null }, "2026-09-27")).toBe(true);
    expect(cultoAconteceEm({ tipo: "semanal", diaSemana: 0, data: null }, "2026-09-28")).toBe(false);
    expect(cultoAconteceEm({ tipo: "especial", diaSemana: null, data: "2026-10-12" }, "2026-10-12")).toBe(true);
  });

  it("descreve com concordância", () => {
    expect(descreverQuando({ tipo: "semanal", diaSemana: 0, data: null, hora: "19:00" })).toBe("Todo domingo às 19:00");
    expect(descreverQuando({ tipo: "semanal", diaSemana: 3, data: null, hora: "20:00" })).toBe("Toda quarta às 20:00");
  });
});

function culto(over: Partial<Culto>): Culto {
  return {
    id: over.nome ?? "c",
    churchId: "i",
    nome: "Culto",
    tipo: "semanal",
    diaSemana: 0,
    data: null,
    hora: "19:00",
    registraChamada: true,
    removido: false,
    ...over,
  };
}

describe("sugerirChamada", () => {
  // 2026-09-27 é domingo.
  const DOMINGO = "2026-09-27";
  const manha = culto({ nome: "Escola dominical", hora: "09:00" });
  const noite = culto({ nome: "Culto da noite", hora: "19:00" });
  const quarta = culto({ nome: "Oração", diaSemana: 3, hora: "20:00" });

  it("domingo de manhã sugere a escola dominical", () => {
    expect(sugerirChamada([manha, noite, quarta], DOMINGO, "09:30")?.culto.nome).toBe("Escola dominical");
  });

  it("domingo à noite sugere o culto da noite (o mais recente que já começou)", () => {
    const s = sugerirChamada([manha, noite, quarta], DOMINGO, "19:40");
    expect(s).toMatchObject({ data: DOMINGO, hoje: true });
    expect(s?.culto.nome).toBe("Culto da noite");
  });

  it("uma hora antes já sugere o culto que vai começar", () => {
    expect(sugerirChamada([manha, noite], DOMINGO, "18:15")?.culto.nome).toBe("Culto da noite");
  });

  it("de madrugada, antes de qualquer culto do dia, sugere o primeiro de hoje", () => {
    expect(sugerirChamada([manha, noite], DOMINGO, "06:00")?.culto.nome).toBe("Escola dominical");
  });

  it("dia sem culto sugere o último que aconteceu", () => {
    // Segunda: o último foi o culto da noite de domingo.
    const s = sugerirChamada([manha, noite, quarta], "2026-09-28", "10:00");
    expect(s).toMatchObject({ data: DOMINGO, hoje: false });
    expect(s?.culto.nome).toBe("Culto da noite");
  });

  it("culto especial de hoje ganha do semanal no mesmo horário", () => {
    const ceia = culto({ nome: "Santa Ceia", tipo: "especial", diaSemana: null, data: DOMINGO, hora: "19:00" });
    expect(sugerirChamada([noite, ceia], DOMINGO, "19:30")?.culto.nome).toBe("Santa Ceia");
  });

  it("ignora culto sem chamada ou removido da programação", () => {
    const ensaio = culto({ nome: "Ensaio", hora: "19:30", registraChamada: false });
    const velho = culto({ nome: "Antigo", hora: "19:20", removido: true });
    expect(sugerirChamada([noite, ensaio, velho], DOMINGO, "19:45")?.culto.nome).toBe("Culto da noite");
    expect(sugerirChamada([ensaio], DOMINGO, "19:45")).toBeNull();
  });
});
