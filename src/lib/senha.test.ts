import { describe, expect, it } from "vitest";
import { mensagemDoQueFalta, requisitosQueFaltam } from "./senha";

describe("senha forte", () => {
  it("senha que atende tudo não tem pendência", () => {
    expect(requisitosQueFaltam("Igreja#2026")).toEqual([]);
    expect(mensagemDoQueFalta("Igreja#2026")).toBeNull();
  });

  it("aponta cada coisa que falta, em português", () => {
    expect(requisitosQueFaltam("igreja").map((r) => r.chave)).toEqual(["tamanho", "maiuscula", "numero", "simbolo"]);
    expect(mensagemDoQueFalta("Igreja2026")).toBe("A senha precisa ter um símbolo (como ! @ # $ % *).");
    expect(mensagemDoQueFalta("igreja#2026")).toBe("A senha precisa ter uma letra maiúscula.");
    expect(mensagemDoQueFalta("IGREJA#X")).toBe("A senha precisa ter uma letra minúscula e um número.");
  });

  it("só conta como símbolo o que o Supabase conta (acento e espaço não valem)", () => {
    expect(requisitosQueFaltam("Igreja2026é").map((r) => r.chave)).toEqual(["simbolo"]);
    expect(requisitosQueFaltam("Igreja 2026").map((r) => r.chave)).toEqual(["simbolo"]);
    for (const s of ["!", "@", "-", "_", ".", "?", "~", "\\", '"', "'"]) {
      expect(requisitosQueFaltam(`Igreja2026${s}`)).toEqual([]);
    }
  });

  it("letra maiúscula acentuada sozinha não conta como maiúscula (igual ao Supabase)", () => {
    expect(requisitosQueFaltam("élan#2026").map((r) => r.chave)).toEqual(["maiuscula"]);
  });
});
