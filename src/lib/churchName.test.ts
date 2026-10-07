import { describe, expect, it } from "vitest";
import { formatChurchName, normalizeSurname } from "./churchName";

describe("normalizeSurname", () => {
  it("vazio, só espaços e nulo viram nenhum sobrenome", () => {
    expect(normalizeSurname("")).toBeNull();
    expect(normalizeSurname("   ")).toBeNull();
    expect(normalizeSurname(null)).toBeNull();
    expect(normalizeSurname(undefined)).toBeNull();
  });

  it("apara e junta espaços repetidos", () => {
    expect(normalizeSurname("  Prainha   -  Promissão ")).toBe("Prainha - Promissão");
  });
});

describe("formatChurchName", () => {
  it("junta nome e sobrenome", () => {
    expect(formatChurchName("Assembleia de Deus Ministério no Ipiranga", "Prainha - Promissão")).toBe(
      "Assembleia de Deus Ministério no Ipiranga · Prainha - Promissão",
    );
  });

  it("sem sobrenome, só o nome", () => {
    expect(formatChurchName("Igreja Betel")).toBe("Igreja Betel");
    expect(formatChurchName("Igreja Betel", "  ")).toBe("Igreja Betel");
    expect(formatChurchName("Igreja Betel", null)).toBe("Igreja Betel");
  });
});
