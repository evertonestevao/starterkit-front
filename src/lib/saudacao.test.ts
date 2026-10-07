import { describe, expect, it } from "vitest";
import { SAUDACAO_PADRAO, limparSaudacao, saudar } from "./saudacao";

describe("saudar", () => {
  it("com nome usa só o primeiro; sem nome, só a saudação", () => {
    expect(saudar("Graça e paz", "Ana Clara Lopes")).toBe("Graça e paz, Ana!");
    expect(saudar("Graça e paz")).toBe("Graça e paz!");
    expect(saudar("Olá", "  ")).toBe("Olá!");
  });

  it("sem saudação definida usa o padrão", () => {
    expect(saudar(null, "Ana")).toBe(`${SAUDACAO_PADRAO}, Ana!`);
    expect(saudar("", null)).toBe(`${SAUDACAO_PADRAO}!`);
    expect(saudar("  !  ")).toBe(`${SAUDACAO_PADRAO}!`);
  });

  it("não duplica a pontuação que a igreja digitou", () => {
    expect(saudar("Paz e bem!", "João")).toBe("Paz e bem, João!");
    expect(saudar("Paz e bem.")).toBe("Paz e bem!");
  });
});

describe("limparSaudacao", () => {
  it("tira espaços repetidos e a pontuação do fim", () => {
    expect(limparSaudacao("  A   paz do Senhor !! ")).toBe("A paz do Senhor");
    expect(limparSaudacao("Olá,")).toBe("Olá");
  });
});
