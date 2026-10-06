import { describe, expect, it } from "vitest";
import { explicarPixStatus, statusDoPix } from "./pixStatus";

describe("statusDoPix", () => {
  it("sem chave não há o que aprovar", () => {
    expect(statusDoPix({ chave: null, aprovadoEm: null, recusadoEm: null })).toBe("sem_chave");
    // Estado antigo sobrando não conta sem a chave.
    expect(statusDoPix({ chave: null, aprovadoEm: "2026-10-01", recusadoEm: null })).toBe("sem_chave");
  });

  it("com chave: aguardando até decidirem", () => {
    expect(statusDoPix({ chave: "a@b.co", aprovadoEm: null, recusadoEm: null })).toBe("aguardando");
    expect(statusDoPix({ chave: "a@b.co", aprovadoEm: "2026-10-01", recusadoEm: null })).toBe("aprovado");
    expect(statusDoPix({ chave: "a@b.co", aprovadoEm: null, recusadoEm: "2026-10-01" })).toBe("recusado");
  });
});

describe("explicarPixStatus", () => {
  it("a recusa mostra o motivo quando há", () => {
    expect(explicarPixStatus("recusado", "Titular não confere")).toContain("Titular não confere");
    expect(explicarPixStatus("recusado", null)).toContain("não foi aprovada.");
  });
});
