import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./secretBox";

const CHAVE = "0".repeat(64); // 32 bytes em hex
const OUTRA = "f".repeat(64);

describe("sealSecret / openSecret", () => {
  it("vai e volta", () => {
    const selado = sealSecret("$aact_chave_da_subconta", CHAVE);

    expect(selado).not.toContain("aact_");
    expect(openSecret(selado, CHAVE)).toBe("$aact_chave_da_subconta");
  });

  it("cada cifragem é diferente, mesmo com o mesmo texto", () => {
    // IV aleatório: dois campos iguais no banco não parecem iguais.
    expect(sealSecret("igual", CHAVE)).not.toBe(sealSecret("igual", CHAVE));
  });

  it("chave errada não decifra", () => {
    const selado = sealSecret("segredo", CHAVE);

    expect(() => openSecret(selado, OUTRA)).toThrow();
  });

  it("texto adulterado falha em vez de devolver lixo", () => {
    const selado = sealSecret("segredo", CHAVE);
    const [v, iv, tag, cifra] = selado.split(".");
    const mexido = [v, iv, tag, `${cifra.slice(0, -2)}AA`].join(".");

    expect(() => openSecret(mexido, CHAVE)).toThrow();
  });

  it("formato desconhecido é recusado", () => {
    expect(() => openSecret("texto-solto", CHAVE)).toThrow(/formato/);
  });

  it("chave curta demais é erro de configuração, não silêncio", () => {
    expect(() => sealSecret("x", "curta")).toThrow(/32 bytes/);
  });
});
