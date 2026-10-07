import { describe, expect, it } from "vitest";
import {
  formatCnpj,
  formatCpf,
  formatDocumentFor,
  isValidCnpj,
  isValidCpf,
  isValidDocumentFor,
  onlyDigits,
} from "./brDocument";

describe("CPF", () => {
  it("aceita CPF válido com ou sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("recusa dígito errado, tamanho errado e repetição", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("1234567890")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });
});

describe("CNPJ", () => {
  it("aceita CNPJ válido com ou sem máscara", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });

  it("recusa dígito errado e repetição", () => {
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });
});

describe("isValidDocumentFor", () => {
  it("amarra o tipo de documento ao tipo de patrocinador", () => {
    expect(isValidDocumentFor("person", "52998224725")).toBe(true);
    expect(isValidDocumentFor("person", "11222333000181")).toBe(false);
    expect(isValidDocumentFor("business", "11222333000181")).toBe(true);
    expect(isValidDocumentFor("business", "52998224725")).toBe(false);
  });

  it("onlyDigits limpa máscara", () => {
    expect(onlyDigits("11.222.333/0001-81")).toBe("11222333000181");
  });
});

describe("máscaras de documento", () => {
  it("formata CPF progressivamente", () => {
    expect(formatCpf("")).toBe("");
    expect(formatCpf("529")).toBe("529");
    expect(formatCpf("5299")).toBe("529.9");
    expect(formatCpf("529982")).toBe("529.982");
    expect(formatCpf("5299822")).toBe("529.982.2");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });

  it("formata CNPJ progressivamente", () => {
    expect(formatCnpj("11")).toBe("11");
    expect(formatCnpj("112")).toBe("11.2");
    expect(formatCnpj("11222")).toBe("11.222");
    expect(formatCnpj("11222333")).toBe("11.222.333");
    expect(formatCnpj("112223330")).toBe("11.222.333/0");
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("aceita valor já mascarado, colado com lixo, e corta o excesso", () => {
    expect(formatCpf("529.982.247-25")).toBe("529.982.247-25");
    expect(formatCpf("  529 982 247 25 999")).toBe("529.982.247-25");
    expect(formatCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81");
    expect(formatCnpj("11222333000181999")).toBe("11.222.333/0001-81");
  });

  it("o valor mascarado continua passando na validação", () => {
    expect(isValidCpf(formatCpf("52998224725"))).toBe(true);
    expect(isValidCnpj(formatCnpj("11222333000181"))).toBe(true);
  });

  it("formatDocumentFor escolhe a máscara pelo tipo", () => {
    expect(formatDocumentFor("person", "52998224725")).toBe("529.982.247-25");
    expect(formatDocumentFor("business", "11222333000181")).toBe("11.222.333/0001-81");
  });
});
