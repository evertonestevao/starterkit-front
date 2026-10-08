import { describe, expect, it } from "vitest";
import { avisoDaChave, comAviso } from "./avisos";

describe("avisos pela URL", () => {
  it("só chaves conhecidas viram aviso; o texto nunca vem da URL", () => {
    expect(avisoDaChave("senha-trocada")).toEqual({
      tipo: "success",
      texto: "Senha trocada. Use a nova no próximo acesso.",
    });
    expect(avisoDaChave("qualquer coisa")).toBeNull();
    expect(avisoDaChave("toString")).toBeNull();
    expect(avisoDaChave(null)).toBeNull();
  });

  it("anexa o aviso ao caminho", () => {
    expect(comAviso("/dashboard", "senha-trocada")).toBe("/dashboard?aviso=senha-trocada");
    expect(comAviso("/dashboard?x=1", "senha-trocada")).toBe("/dashboard?x=1&aviso=senha-trocada");
  });
});
