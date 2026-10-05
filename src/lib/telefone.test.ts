import { describe, expect, it } from "vitest";
import { mascaraTelefone } from "./telefone";

describe("mascaraTelefone", () => {
  it("formata celular e fixo", () => {
    expect(mascaraTelefone("11999998888")).toBe("(11) 99999-8888");
    expect(mascaraTelefone("1133334444")).toBe("(11) 3333-4444");
    expect(mascaraTelefone("(11) 99999-8888")).toBe("(11) 99999-8888");
  });

  it("vai formatando enquanto digita, sem pontuação sobrando no fim", () => {
    expect(mascaraTelefone("1")).toBe("(1");
    expect(mascaraTelefone("11")).toBe("(11");
    expect(mascaraTelefone("119")).toBe("(11) 9");
    expect(mascaraTelefone("119999")).toBe("(11) 9999");
    expect(mascaraTelefone("1199998")).toBe("(11) 9999-8");
  });

  it("apagar não trava: tirar o último caractere sempre tira um dígito", () => {
    // "(11) 9" sem o 9 vira "(11) ", que a máscara reduz para "(11".
    expect(mascaraTelefone("(11) ")).toBe("(11");
    expect(mascaraTelefone("(11) 9999-")).toBe("(11) 9999");
    expect(mascaraTelefone("(")).toBe("");
  });

  it("tira letras e corta o que passa de 11 dígitos", () => {
    expect(mascaraTelefone("11 9abc9999-8888 ramal 2")).toBe("(11) 99999-8888");
    expect(mascaraTelefone("119999988887777")).toBe("(11) 99999-8888");
  });

  it("mantém o +55 quando vem com o código do país", () => {
    expect(mascaraTelefone("5511999998888")).toBe("+55 (11) 99999-8888");
    expect(mascaraTelefone("+55 11 99999-8888")).toBe("+55 (11) 99999-8888");
    expect(mascaraTelefone("+55")).toBe("+55");
  });

  it("número de outro país fica como foi digitado", () => {
    expect(mascaraTelefone("+1 (415) 555-0100")).toBe("+1 (415) 555-0100");
    expect(mascaraTelefone("+351 912 345 678x")).toBe("+351 912 345 678");
  });

  it("vazio continua vazio", () => {
    expect(mascaraTelefone("")).toBe("");
    expect(mascaraTelefone(null)).toBe("");
    expect(mascaraTelefone(undefined)).toBe("");
  });
});
