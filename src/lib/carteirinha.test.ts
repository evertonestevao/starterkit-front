import { describe, expect, it } from "vitest";
import { CODIGO_RE, FINALIDADES, codigoEmBlocos, ehMenor, textoDoTermo, validadePadrao } from "./carteirinha";
import { qrMatriz } from "./qr";

describe("carteirinha", () => {
  it("a validade sugerida é de um ano", () => {
    expect(validadePadrao("2026-10-06")).toBe("2027-10-06");
    // 29 de fevereiro cai no dia seguinte do ano que não é bissexto.
    expect(validadePadrao("2028-02-29")).toBe("2029-03-01");
  });

  it("menor é quem tem menos de 18; sem nascimento, trata como adulto", () => {
    expect(ehMenor("2010-01-01", "2026-10-06")).toBe(true);
    expect(ehMenor("2008-10-06", "2026-10-06")).toBe(false);
    expect(ehMenor("2008-10-07", "2026-10-06")).toBe(true);
    expect(ehMenor(null, "2026-10-06")).toBe(false);
  });

  it("o código sai em blocos de quatro e o formato aceita só 16 hexadecimais", () => {
    expect(codigoEmBlocos("A1B2C3D4E5F60789")).toBe("A1B2 C3D4 E5F6 0789");
    expect(CODIGO_RE.test("a1b2c3d4e5f60789")).toBe(true);
    expect(CODIGO_RE.test("A1B2C3D4E5F6078")).toBe(false);
    expect(CODIGO_RE.test("A1B2C3D4E5F6078Z")).toBe(false);
  });
});

describe("textoDoTermo", () => {
  it("o adulto assina por si; o menor, pelo responsável", () => {
    const adulto = textoDoTermo({ nome: "Ana Souza", igreja: "Igreja X", menor: false });
    expect(adulto.abertura).toContain("Eu, Ana Souza, autorizo a Igreja X");
    const menor = textoDoTermo({ nome: "Davi", igreja: "Igreja X", menor: true });
    expect(menor.abertura).toContain("responsável legal por Davi");
  });

  it("traz as três finalidades, separadas, e diz que o dado é sensível", () => {
    const t = textoDoTermo({ nome: "Ana", igreja: "Igreja X", menor: false });
    expect(t.finalidades).toHaveLength(FINALIDADES.length);
    expect(FINALIDADES.map((f) => f.chave)).toEqual(["cadastro", "foto", "carteirinha"]);
    expect(t.abertura).toContain("dado sensível");
    expect(t.direitos.join(" ")).toContain("retirar");
  });
});

describe("qrMatriz", () => {
  it("devolve uma matriz quadrada com os três cantos de localização", () => {
    const m = qrMatriz("https://exemplo.org/verificar/A1B2C3D4E5F60789");
    expect(m.length).toBeGreaterThan(20);
    expect(m.every((linha) => linha.length === m.length)).toBe(true);
    // Canto de localização: a primeira linha começa com 7 módulos escuros.
    expect(m[0]!.slice(0, 7).every(Boolean)).toBe(true);
    expect(m[0]!.slice(-7).every(Boolean)).toBe(true);
    expect(m.at(-1)!.slice(0, 7).every(Boolean)).toBe(true);
  });
});
