import { describe, expect, it } from "vitest";
import { camposPorPreencher, carimbarVersao, dataPorExtenso, isPublicoDosTermos } from "./termos";

describe("dataPorExtenso", () => {
  it("escreve a data como no documento", () => {
    expect(dataPorExtenso("2026-10-07")).toBe("7 de outubro de 2026");
    expect(dataPorExtenso("2027-03-21")).toBe("21 de março de 2027");
  });
});

describe("carimbarVersao", () => {
  const doc = "# Termos de Uso — Igrejas\n\n**Versão 3 — vigente desde 7 de outubro de 2026**\n\nTexto.";

  it("troca só a linha da versão, pelo número e pela data da publicação", () => {
    expect(carimbarVersao(doc, 4, "2026-11-02")).toBe(
      "# Termos de Uso — Igrejas\n\n**Versão 4 — vigente desde 2 de novembro de 2026**\n\nTexto.",
    );
  });

  it("documento sem a linha fica como está", () => {
    expect(carimbarVersao("# Termos\n\nTexto.", 4, "2026-11-02")).toBe("# Termos\n\nTexto.");
  });

  it("não mexe em menção à versão no meio de um parágrafo", () => {
    const texto = "# T\n\nA **Versão 2 — vigente desde 2025** foi substituída.";
    expect(carimbarVersao(texto, 4, "2026-11-02")).toBe(texto);
  });
});

describe("camposPorPreencher", () => {
  it("acha os campos de modelo, sem repetir", () => {
    const texto = "Operada por [RAZÃO SOCIAL], CNPJ [CNPJ]. Contato: [EMAIL DE CONTATO]. De novo: [CNPJ].";
    expect(camposPorPreencher(texto)).toEqual(["[RAZÃO SOCIAL]", "[CNPJ]", "[EMAIL DE CONTATO]"]);
  });

  it("link e texto comum entre colchetes não são campo", () => {
    expect(camposPorPreencher("Veja em [/terms/igreja](/terms/igreja) e [aqui](/x). Nota [sic].")).toEqual([]);
  });
});

describe("isPublicoDosTermos", () => {
  it("só os dois públicos existem", () => {
    expect(isPublicoDosTermos("igreja")).toBe(true);
    expect(isPublicoDosTermos("patrocinador")).toBe(true);
    expect(isPublicoDosTermos("todos")).toBe(false);
  });
});
