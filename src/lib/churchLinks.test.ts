import { describe, expect, it } from "vitest";
import {
  CHURCH_LINK_VALIDITY_OPTIONS,
  churchLinkPath,
  describeApproved,
  describeValidity,
  inviteOptions,
  linkExpiration,
  LINK_VISIBILITY_NOTES,
  moveDestinations,
  safeChurchLinkPath,
} from "./churchLinks";

describe("inviteOptions", () => {
  it("congregação não gera link", () => {
    expect(inviteOptions({ tipo: "congregacao", parentId: "x" })).toEqual([]);
    expect(inviteOptions({ tipo: "congregacao", parentId: null })).toEqual([]);
  });

  it("igreja sem superior pode ter subsedes e congregações", () => {
    expect(inviteOptions({ tipo: "sede", parentId: null })).toEqual(["subsede", "congregacao"]);
    // Igreja nova nasce como subsede sem superior: é ela que vira sede ao receber a primeira.
    expect(inviteOptions({ tipo: "subsede", parentId: null })).toEqual(["subsede", "congregacao"]);
  });

  it("subsede que já tem superior só convida congregações", () => {
    expect(inviteOptions({ tipo: "subsede", parentId: "sede-1" })).toEqual(["congregacao"]);
  });
});

describe("moveDestinations", () => {
  const sede = { id: "sede", tipo: "sede" as const, parentId: null };

  it("a sede pode mover para debaixo dela ou de uma das subsedes dela", () => {
    const filhas = [
      { id: "sub-a", tipo: "subsede" as const },
      { id: "sub-b", tipo: "subsede" as const },
      { id: "cong-c", tipo: "congregacao" as const },
    ];

    expect(moveDestinations(sede, filhas, { id: "cong-c" })).toEqual([
      { parentId: "sede", tipos: ["subsede", "congregacao"] },
      { parentId: "sub-a", tipos: ["congregacao"] },
      { parentId: "sub-b", tipos: ["congregacao"] },
    ]);
  });

  it("não oferece a própria igreja movida como destino", () => {
    const filhas = [
      { id: "sub-a", tipo: "subsede" as const },
      { id: "sub-b", tipo: "subsede" as const },
    ];

    const destinos = moveDestinations(sede, filhas, { id: "sub-a" });

    expect(destinos.map((d) => d.parentId)).toEqual(["sede", "sub-b"]);
  });

  it("subsede que tem superior só reposiciona sob si mesma, como congregação", () => {
    const sub = { id: "sub", tipo: "subsede" as const, parentId: "sede" };

    expect(moveDestinations(sub, [{ id: "cong", tipo: "congregacao" }], { id: "cong" })).toEqual([
      { parentId: "sub", tipos: ["congregacao"] },
    ]);
  });
});

describe("safeChurchLinkPath", () => {
  it("só aceita o caminho de um link de vínculo", () => {
    const token = "a".repeat(43);
    expect(safeChurchLinkPath(`/vinculo/${token}`)).toBe(`/vinculo/${token}`);
    expect(safeChurchLinkPath(churchLinkPath("abc_-DEF".repeat(6)))).not.toBeNull();
  });

  it("descarta URL absoluta, outro caminho e lixo", () => {
    for (const ruim of [
      "https://malicioso.example/vinculo/" + "a".repeat(43),
      "//malicioso.example/vinculo/" + "a".repeat(43),
      "/dashboard",
      "/vinculo/curto",
      "/vinculo/" + ".".repeat(30),
      "/vinculo/" + "a".repeat(43) + "/../../admin",
      "/vinculo/" + "a".repeat(43) + "?x=1",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(safeChurchLinkPath(ruim), String(ruim)).toBeNull();
    }
  });
});

describe("describeApproved e avisos", () => {
  it("a frase do vínculo aprovado", () => {
    expect(
      describeApproved({ parentName: "Comunidade da Graça", childName: "Graça Litoral", tipo: "subsede" }),
    ).toBe("Graça Litoral agora é subsede de Comunidade da Graça.");
  });

  it("o caminho leva o token codificado", () => {
    expect(churchLinkPath("abc_-DEF")).toBe("/vinculo/abc_-DEF");
    expect(churchLinkPath("a/b")).toBe("/vinculo/a%2Fb");
  });

  it("a tela do link diz que nada muda antes da aprovação e o que a superior passa a ver", () => {
    const texto = LINK_VISIBILITY_NOTES.join(" ");
    expect(texto).toMatch(/Nada muda até/);
    expect(texto).toMatch(/aprovar o seu pedido/);
    expect(texto).toMatch(/contagem de pedidos de oração/);
    expect(texto).toMatch(/desfazer o vínculo/);
  });
});

describe("validade do link", () => {
  const agora = new Date("2026-09-26T12:00:00Z");

  it("as opções são 7, 15, 30 dias ou sem validade — não há padrão", () => {
    expect([...CHURCH_LINK_VALIDITY_OPTIONS]).toEqual([7, 15, 30, null]);
  });

  it("calcula a data de expiração, ou nenhuma quando o link não expira", () => {
    expect(linkExpiration(7, agora)).toBe("2026-10-03T12:00:00.000Z");
    expect(linkExpiration(15, agora)).toBe("2026-10-11T12:00:00.000Z");
    expect(linkExpiration(30, agora)).toBe("2026-10-26T12:00:00.000Z");
    expect(linkExpiration(null, agora)).toBeNull();
  });

  it("descreve a validade", () => {
    expect(describeValidity(15)).toBe("15 dias");
    expect(describeValidity(null)).toBe("Sem validade");
  });
});
