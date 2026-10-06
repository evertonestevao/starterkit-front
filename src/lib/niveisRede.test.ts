import { describe, expect, it } from "vitest";
import { NOMES_PADRAO, contarNivel, nomeNivel, saoNomesPadrao, type NomesNiveis } from "./niveisRede";

const FILIAIS: NomesNiveis = {
  sede: { singular: "Igreja-mãe", plural: "Igrejas-mãe" },
  subsede: { singular: "Filial", plural: "Filiais" },
  congregacao: { singular: "Ponto de pregação", plural: "Pontos de pregação" },
};

describe("nomeNivel", () => {
  it("singular por padrão, plural quando pedido", () => {
    expect(nomeNivel(NOMES_PADRAO, "subsede")).toBe("Subsede");
    expect(nomeNivel(FILIAIS, "subsede")).toBe("Filial");
    expect(nomeNivel(FILIAIS, "subsede", { plural: true })).toBe("Filiais");
  });

  it("a quantidade escolhe o número: só 1 é singular", () => {
    expect(nomeNivel(FILIAIS, "congregacao", { quantidade: 1 })).toBe("Ponto de pregação");
    expect(nomeNivel(FILIAIS, "congregacao", { quantidade: 0 })).toBe("Pontos de pregação");
    expect(nomeNivel(FILIAIS, "congregacao", { quantidade: 4 })).toBe("Pontos de pregação");
  });

  it("minúsculo para o meio de frase, com acento", () => {
    expect(nomeNivel(NOMES_PADRAO, "congregacao", { minusculo: true })).toBe("congregação");
    expect(nomeNivel(FILIAIS, "sede", { minusculo: true })).toBe("igreja-mãe");
  });
});

describe("contarNivel", () => {
  it("número + nome no número certo", () => {
    expect(contarNivel(NOMES_PADRAO, "congregacao", 1)).toBe("1 congregação");
    expect(contarNivel(FILIAIS, "subsede", 3)).toBe("3 filiais");
  });
});

describe("saoNomesPadrao", () => {
  it("reconhece o padrão e qualquer troca", () => {
    expect(saoNomesPadrao(NOMES_PADRAO)).toBe(true);
    expect(saoNomesPadrao(FILIAIS)).toBe(false);
    expect(saoNomesPadrao({ ...NOMES_PADRAO, subsede: { singular: "Subsede", plural: "Sub-sedes" } })).toBe(false);
  });
});
