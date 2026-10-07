import { describe, expect, it } from "vitest";
import {
  VALIDADE_RASCUNHO_MS,
  apagarRascunho,
  gravarRascunho,
  lerRascunho,
  manterSoConhecidos,
  type Armazenamento,
} from "./rascunhoChamada";

function memoria(): Armazenamento & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
    removeItem: (k) => void dados.delete(k),
  };
}

const AGORA = 1_800_000_000_000;

describe("rascunho da chamada", () => {
  it("guarda e devolve o que foi marcado, com a hora e se ficou pendente de envio", () => {
    const a = memoria();
    gravarRascunho(a, "culto:1:2026-10-04", { estados: { m1: "ausente" } }, AGORA);
    expect(lerRascunho(a, "culto:1:2026-10-04", AGORA + 60_000)).toEqual({
      dados: { estados: { m1: "ausente" } },
      salvoEm: AGORA,
      pendente: false,
    });
    gravarRascunho(a, "culto:1:2026-10-04", { estados: {} }, AGORA, true);
    expect(lerRascunho(a, "culto:1:2026-10-04", AGORA)?.pendente).toBe(true);
  });

  it("cada chamada tem o seu rascunho", () => {
    const a = memoria();
    gravarRascunho(a, "culto:1:2026-10-04", "domingo", AGORA);
    expect(lerRascunho(a, "culto:1:2026-10-11", AGORA)).toBeNull();
    expect(lerRascunho(a, "ebd:1:2026-10-04", AGORA)).toBeNull();
  });

  it("vencido (mais de 24h) ou com data no futuro é apagado", () => {
    const a = memoria();
    gravarRascunho(a, "k", 1, AGORA);
    expect(lerRascunho(a, "k", AGORA + VALIDADE_RASCUNHO_MS + 1)).toBeNull();
    expect(a.dados.size).toBe(0);
    gravarRascunho(a, "k", 1, AGORA + 5_000);
    expect(lerRascunho(a, "k", AGORA)).toBeNull();
  });

  it("conteúdo corrompido ou de outra versão não quebra a tela", () => {
    const a = memoria();
    a.dados.set("chamada-rascunho:k", "{isso não é json");
    expect(lerRascunho(a, "k", AGORA)).toBeNull();
    expect(a.dados.size).toBe(0);
    a.dados.set("chamada-rascunho:k", JSON.stringify({ v: 99, dados: 1, salvoEm: AGORA }));
    expect(lerRascunho(a, "k", AGORA)).toBeNull();
  });

  it("aparelho sem armazenamento (modo privado, cheio) não derruba nada", () => {
    const quebrado: Armazenamento = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("cheio");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(() => gravarRascunho(quebrado, "k", 1, AGORA)).not.toThrow();
    expect(lerRascunho(quebrado, "k", AGORA)).toBeNull();
    expect(() => apagarRascunho(quebrado, "k")).not.toThrow();
  });

  it("apagar remove só o rascunho pedido", () => {
    const a = memoria();
    gravarRascunho(a, "a", 1, AGORA);
    gravarRascunho(a, "b", 2, AGORA);
    apagarRascunho(a, "a");
    expect(lerRascunho(a, "a", AGORA)).toBeNull();
    expect(lerRascunho(a, "b", AGORA)?.dados).toBe(2);
  });

  it("ao recuperar, quem saiu da lista desde então é descartado", () => {
    expect(manterSoConhecidos({ m1: "presente", saiu: "ausente" }, ["m1", "novo"])).toEqual({ m1: "presente" });
  });
});
