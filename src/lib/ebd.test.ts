import { describe, expect, it } from "vitest";
import {
  centavosDe,
  domingoSugerido,
  domingosEntre,
  formatarReais,
  idadeEm,
  mensagemSaudadeEbd,
  proximoTrimestre,
  sugerirClassePorIdade,
  textoDaLicao,
  totaisDoDia,
  trimestreDe,
} from "./ebd";

describe("domingoSugerido", () => {
  it("hoje se for domingo; senão o último domingo", () => {
    expect(domingoSugerido("2026-09-27")).toBe("2026-09-27"); // domingo
    expect(domingoSugerido("2026-10-01")).toBe("2026-09-27"); // quinta
    expect(domingoSugerido("2026-10-03")).toBe("2026-09-27"); // sábado
  });
});

describe("oferta", () => {
  it("lê o valor digitado em vários formatos", () => {
    expect(centavosDe("12,50")).toBe(1250);
    expect(centavosDe("12.50")).toBe(1250);
    expect(centavosDe("R$ 1.234,56")).toBe(123456);
    expect(centavosDe("10")).toBe(1000);
    expect(centavosDe("")).toBe(0);
    expect(centavosDe("dez")).toBeNull();
    expect(centavosDe("1,234")).toBeNull();
  });

  it("formata em reais", () => {
    expect(formatarReais(1250).replace(/\s/g, " ")).toBe("R$ 12,50");
  });
});

describe("totaisDoDia", () => {
  it("soma as classes e conta quantas fizeram chamada", () => {
    const linha = (over: object) => ({
      classeId: "x",
      classeNome: "X",
      matriculados: 10,
      chamadaFeita: true,
      presentes: 8,
      ausentes: 1,
      justificados: 1,
      visitantes: 2,
      biblias: 7,
      revistas: 6,
      ofertaCentavos: 1500,
      licao: null,
      ...over,
    });
    const t = totaisDoDia([linha({}), linha({ chamadaFeita: false, presentes: 0, ofertaCentavos: 0 })]);
    expect(t).toMatchObject({ matriculados: 20, presentes: 8, ofertaCentavos: 1500, classesComChamada: 1 });
  });
});

describe("idadeEm", () => {
  it("anos completos na data", () => {
    expect(idadeEm("2016-10-05", "2026-10-04")).toBe(9);
    expect(idadeEm("2016-10-04", "2026-10-04")).toBe(10);
    expect(idadeEm(null, "2026-10-04")).toBeNull();
  });
});

describe("trimestres", () => {
  const t3 = { id: "3", nome: "3º", inicio: "2026-07-01", fim: "2026-09-30", revista: null };
  const t4 = { id: "4", nome: "4º", inicio: "2026-10-01", fim: "2026-12-31", revista: null };

  it("acha o trimestre da data", () => {
    expect(trimestreDe([t3, t4], "2026-10-04")?.id).toBe("4");
    expect(trimestreDe([t3], "2026-10-04")).toBeNull();
  });

  it("sugere o próximo pelo calendário", () => {
    expect(proximoTrimestre([], "2026-10-01")).toEqual({
      nome: "4º trimestre de 2026",
      inicio: "2026-10-01",
      fim: "2026-12-31",
    });
    expect(proximoTrimestre([t3, t4], "2026-10-01")).toEqual({
      nome: "1º trimestre de 2027",
      inicio: "2027-01-01",
      fim: "2027-03-31",
    });
    expect(proximoTrimestre([], "2026-02-10").fim).toBe("2026-03-31");
  });
});

describe("mensagemSaudadeEbd", () => {
  it("para criança fala com a família", () => {
    expect(mensagemSaudadeEbd("Pedro Ferreira", "Juniores", "Igreja X", true)).toContain("Sentimos falta do(a) Pedro");
    expect(mensagemSaudadeEbd("Ana Souza", "Adultos", "Igreja X", false)).toContain("Olá, Ana!");
  });
});

describe("sugerirClassePorIdade", () => {
  const classes = [
    { id: "primarios", ativa: true, idadeMinima: 6, idadeMaxima: 8 },
    { id: "juniores", ativa: true, idadeMinima: 9, idadeMaxima: 11 },
    { id: "jovens", ativa: true, idadeMinima: 12, idadeMaxima: 24 },
    { id: "adultos", ativa: true, idadeMinima: 25, idadeMaxima: null },
    { id: "antiga", ativa: false, idadeMinima: 9, idadeMaxima: 9 },
    { id: "sem-faixa", ativa: true, idadeMinima: null, idadeMaxima: null },
  ];
  it("escolhe pela idade na data", () => {
    expect(sugerirClassePorIdade(classes, "2017-06-01", "2027-01-03")).toBe("juniores"); // 9 anos
    expect(sugerirClassePorIdade(classes, "2017-06-01", "2026-01-04")).toBe("primarios"); // 8 anos
    expect(sugerirClassePorIdade(classes, "1990-01-01", "2027-01-03")).toBe("adultos");
  });
  it("ignora classe encerrada e sem faixa; sem nascimento não sugere", () => {
    expect(sugerirClassePorIdade(classes, "2017-06-01", "2027-01-03")).not.toBe("antiga");
    expect(sugerirClassePorIdade(classes, null, "2027-01-03")).toBeNull();
    expect(sugerirClassePorIdade(classes, "2023-01-01", "2027-01-03")).toBeNull(); // 4 anos: nenhuma
  });
});

describe("lições", () => {
  it("lista os domingos do trimestre", () => {
    const domingos = domingosEntre("2026-10-01", "2026-12-31");
    expect(domingos[0]).toBe("2026-10-04");
    expect(domingos.at(-1)).toBe("2026-12-27");
    expect(domingos).toHaveLength(13);
  });
  it("monta o texto da lição", () => {
    expect(textoDaLicao({ numero: 3, titulo: "A fé de Abraão" })).toBe("Lição 3 — A fé de Abraão");
    expect(textoDaLicao({ numero: 4, titulo: null })).toBe("Lição 4");
  });
});
