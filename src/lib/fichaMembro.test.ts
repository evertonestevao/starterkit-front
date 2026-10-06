import { describe, expect, it } from "vitest";
import { enderecoEmLinha, fichaPreenchida, fichaVazia, mascaraCep, temConjuge } from "./fichaMembro";

describe("mascaraCep", () => {
  it("põe o traço depois do quinto dígito e corta em 8", () => {
    expect(mascaraCep("17012")).toBe("17012");
    expect(mascaraCep("170123")).toBe("17012-3");
    expect(mascaraCep("17012345")).toBe("17012-345");
    expect(mascaraCep("17.012-345 99")).toBe("17012-345");
    expect(mascaraCep(null)).toBe("");
  });
});

describe("enderecoEmLinha", () => {
  const vazio = fichaVazia(true);

  it("junta só o que foi preenchido", () => {
    expect(
      enderecoEmLinha({
        ...vazio,
        logradouro: "Rua das Flores",
        numero: "120",
        bairro: "Centro",
        cidade: "Bauru",
        uf: "SP",
        cep: "17012345",
      }),
    ).toBe("Rua das Flores, 120 · Centro · Bauru/SP · CEP 17012-345");
    expect(enderecoEmLinha({ ...vazio, cidade: "Bauru" })).toBe("Bauru");
  });

  it("sem nada preenchido devolve null", () => {
    expect(enderecoEmLinha(vazio)).toBeNull();
  });
});

describe("fichaVazia / fichaPreenchida", () => {
  it("a situação de partida segue o cadastro", () => {
    expect(fichaVazia(true).situacao).toBe("ativo");
    expect(fichaVazia(false).situacao).toBe("afastado");
  });

  it("só a situação não conta como ficha preenchida", () => {
    expect(fichaPreenchida(fichaVazia(false))).toBe(false);
    expect(fichaPreenchida({ ...fichaVazia(true), situacao: "falecido", situacaoEm: "2026-01-10" })).toBe(false);
    expect(fichaPreenchida({ ...fichaVazia(true), profissao: "Professora" })).toBe(true);
  });
});

describe("temConjuge", () => {
  it("casado e união estável", () => {
    expect(temConjuge("casado")).toBe(true);
    expect(temConjuge("uniao_estavel")).toBe(true);
    expect(temConjuge("viuvo")).toBe(false);
    expect(temConjuge(null)).toBe(false);
  });
});
