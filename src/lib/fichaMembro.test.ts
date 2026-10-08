import { describe, expect, it } from "vitest";
import {
  cpfValido,
  enderecoEmLinha,
  fichaPreenchida,
  fichaVazia,
  mascaraCep,
  mascaraCpf,
  temConjuge,
} from "./fichaMembro";

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

describe("CPF", () => {
  it("mascaraCpf formata enquanto digita e ignora o que não é número", () => {
    expect(mascaraCpf("529")).toBe("529");
    expect(mascaraCpf("5299822")).toBe("529.982.2");
    expect(mascaraCpf("52998224725")).toBe("529.982.247-25");
    expect(mascaraCpf("529.982.247-25 extra 99")).toBe("529.982.247-25");
    expect(mascaraCpf(null)).toBe("");
  });

  it("cpfValido confere os dígitos verificadores", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("52998224724")).toBe(false); // um dígito trocado
    expect(cpfValido("11111111111")).toBe(false); // todos iguais
    expect(cpfValido("123")).toBe(false);
    expect(cpfValido("")).toBe(false);
  });
});
