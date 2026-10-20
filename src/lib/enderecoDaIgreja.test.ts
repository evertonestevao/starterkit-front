import { describe, expect, it } from "vitest";
import { ENDERECO_VAZIO, linhaDoEndereco } from "./enderecoDaIgreja";

describe("linhaDoEndereco", () => {
  it("monta o endereço completo numa linha", () => {
    expect(
      linhaDoEndereco({
        cep: "16400010",
        logradouro: "Rua das Flores",
        numero: "540",
        complemento: "sala 2",
        bairro: "Centro",
        cidade: "Lins",
        uf: "SP",
      }),
    ).toBe("Rua das Flores, 540, sala 2 - Centro, Lins/SP, 16400-010");
  });

  it("pula o que não foi preenchido", () => {
    expect(linhaDoEndereco({ ...ENDERECO_VAZIO, cidade: "Guaiçara", uf: "SP" })).toBe("Guaiçara/SP");
    expect(linhaDoEndereco({ ...ENDERECO_VAZIO, logradouro: "Rua A", numero: "10", cidade: "Lins" })).toBe(
      "Rua A, 10 - Lins",
    );
  });

  it("nada preenchido vira null", () => {
    expect(linhaDoEndereco(ENDERECO_VAZIO)).toBeNull();
  });
});
