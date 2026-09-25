import { describe, expect, it } from "vitest";
import { CARGO_LABEL, CHURCH_CARGOS, isCargoUnico, isChurchCargo, pastorLabel, sortLeaders } from "./churchLeaders";

describe("cargos", () => {
  it("o catálogo tem os cinco cargos combinados, com o Pastor primeiro", () => {
    expect(CHURCH_CARGOS.map((c) => c.slug)).toEqual([
      "pastor",
      "pastor_auxiliar",
      "presbitero",
      "diacono",
      "secretario",
    ]);
    expect(CARGO_LABEL.presbitero).toBe("Presbítero");
  });

  it("só o Pastor é de uma pessoa por igreja", () => {
    expect(isCargoUnico("pastor")).toBe(true);
    expect(isCargoUnico("pastor_auxiliar")).toBe(false);
    expect(isCargoUnico("secretario")).toBe(false);
  });

  it("isChurchCargo só aceita cargos do catálogo", () => {
    expect(isChurchCargo("diacono")).toBe(true);
    expect(isChurchCargo("bispo")).toBe(false);
    expect(isChurchCargo(null)).toBe(false);
  });

  it("sortLeaders ordena pelo catálogo e, dentro do cargo, por nome", () => {
    const ordenados = sortLeaders([
      { cargo: "secretario", nome: "Ana" },
      { cargo: "diacono", nome: "Zeca" },
      { cargo: "diacono", nome: "Álvaro" },
      { cargo: "pastor", nome: "Pedro" },
    ]);
    expect(ordenados.map((l) => l.nome)).toEqual(["Pedro", "Álvaro", "Zeca", "Ana"]);
  });
});

describe("pastorLabel", () => {
  it("mostra o Pastor quando há nome e nada quando não há", () => {
    expect(pastorLabel("João Silva")).toBe("Pastor: João Silva");
    expect(pastorLabel("  ")).toBeNull();
    expect(pastorLabel(undefined)).toBeNull();
  });
});
