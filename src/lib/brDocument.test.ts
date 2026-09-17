import { describe, expect, it } from "vitest";
import { isValidCnpj, isValidCpf, isValidDocumentFor, onlyDigits } from "./brDocument";

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
