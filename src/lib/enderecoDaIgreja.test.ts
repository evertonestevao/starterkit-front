import { describe, expect, it } from "vitest";
import { enderecoPeloCep } from "./enderecoDaIgreja";

describe("enderecoPeloCep", () => {
  it("monta rua, bairro e cidade e deixa o cursor no lugar do número", () => {
    const r = enderecoPeloCep({ logradouro: "Rua das Flores", bairro: "Centro", cidade: "Lins", uf: "SP" });
    expect(r.texto).toBe("Rua das Flores,  - Centro, Lins/SP");
    expect(r.texto.slice(0, r.posicaoDoNumero)).toBe("Rua das Flores, ");
  });

  it("CEP geral de cidade pequena: só cidade e UF", () => {
    expect(enderecoPeloCep({ logradouro: "", bairro: "", cidade: "Guaiçara", uf: "SP" })).toEqual({
      texto: "Guaiçara/SP",
      posicaoDoNumero: 0,
    });
  });
});
