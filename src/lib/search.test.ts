import { describe, expect, it } from "vitest";
import { normalizeSearch } from "./search";

describe("normalizeSearch", () => {
  it("ignora acento e caixa", () => {
    expect(normalizeSearch("Graça Zona Norte")).toBe("graca zona norte");
    expect(normalizeSearch("GRAÇA")).toBe(normalizeSearch("graça"));
  });

  it("tira espaço das pontas, mas não do meio", () => {
    expect(normalizeSearch("  Vila Nova  ")).toBe("vila nova");
  });
});
