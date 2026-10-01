import { describe, expect, it } from "vitest";
import { cargosAtribuiveis, ordenarCargos, origemDoCargo, pastorLabel, podeEditarCargo } from "./cargos";

describe("origemDoCargo", () => {
  it("plataforma, próprio ou herdado conforme a igreja ativa", () => {
    expect(origemDoCargo(null, "igreja")).toBe("plataforma");
    expect(origemDoCargo("igreja", "igreja")).toBe("proprio");
    expect(origemDoCargo("sede", "igreja")).toBe("herdado");
  });
});

describe("podeEditarCargo", () => {
  it("só o próprio; padrão e herdado ficam só para uso", () => {
    expect(podeEditarCargo({ origem: "proprio" })).toBe(true);
    expect(podeEditarCargo({ origem: "herdado" })).toBe(false);
    expect(podeEditarCargo({ origem: "plataforma" })).toBe(false);
  });
});

describe("ordenarCargos", () => {
  it("padrão, depois herdados, depois próprios; dentro de cada, ordem e nome", () => {
    const ordenados = ordenarCargos([
      { origem: "proprio" as const, ordem: 1, nome: "Zelador" },
      { origem: "plataforma" as const, ordem: 4, nome: "Diácono" },
      { origem: "herdado" as const, ordem: 100, nome: "Coordenador" },
      { origem: "plataforma" as const, ordem: 1, nome: "Pastor" },
    ]);
    expect(ordenados.map((c) => c.nome)).toEqual(["Pastor", "Diácono", "Coordenador", "Zelador"]);
  });
});

describe("cargosAtribuiveis", () => {
  it("desativado não pode ser dado", () => {
    expect(cargosAtribuiveis([{ desativado: false }, { desativado: true }])).toHaveLength(1);
  });
});

describe("pastorLabel", () => {
  it("mostra o Pastor quando há nome e nada quando não há", () => {
    expect(pastorLabel("João Silva")).toBe("Pastor: João Silva");
    expect(pastorLabel("  ")).toBeNull();
    expect(pastorLabel(undefined)).toBeNull();
  });
});
