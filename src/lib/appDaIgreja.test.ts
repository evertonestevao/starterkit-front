import { describe, expect, it } from "vitest";
import {
  iniciaisDaIgreja,
  inicioDoAppDaIgreja,
  inicioSeguro,
  manifestoDaIgreja,
  nomeCurtoDoApp,
  tamanhoDeIcone,
} from "./appDaIgreja";

describe("inicioDoAppDaIgreja", () => {
  it("no endereço da plataforma, o caminho público da igreja", () => {
    expect(inicioDoAppDaIgreja("adbelem", false)).toBe("/igreja/adbelem");
    expect(inicioDoAppDaIgreja("adbelem~lins", false)).toBe("/igreja/adbelem/lins");
  });

  it("no domínio próprio da rede, a sede é a raiz e as de baixo ficam em /igreja/{codigo}", () => {
    expect(inicioDoAppDaIgreja("adbelem", true)).toBe("/");
    expect(inicioDoAppDaIgreja("adbelem~lins", true)).toBe("/igreja/lins");
  });
});

describe("inicioSeguro", () => {
  it("aceita caminho deste site e recusa o que leva para fora", () => {
    expect(inicioSeguro("/igreja/adbelem", "/x")).toBe("/igreja/adbelem");
    expect(inicioSeguro("/", "/x")).toBe("/");
    for (const ruim of [null, "", "igreja", "//evil.com", "https://evil.com", "/a b", '/a"b', "/a\\b"]) {
      expect(inicioSeguro(ruim, "/padrao")).toBe("/padrao");
    }
  });
});

describe("nomeCurtoDoApp e iniciaisDaIgreja", () => {
  it("nome curto cabe embaixo do ícone", () => {
    expect(nomeCurtoDoApp("Betel")).toBe("Betel");
    expect(nomeCurtoDoApp("Assembleia de Deus Ministério Belém")).toBe("Belém");
    expect(nomeCurtoDoApp("Igreja Presbiteriana Independentíssima")).toHaveLength(12);
  });

  it("iniciais para quem não tem logo", () => {
    expect(iniciaisDaIgreja("Igreja Batista Central")).toBe("IB");
    expect(iniciaisDaIgreja("Assembleia de Deus Belém")).toBe("AD");
    expect(iniciaisDaIgreja("Betel")).toBe("B");
  });
});

describe("manifestoDaIgreja", () => {
  const m = manifestoDaIgreja({
    nome: "Assembleia de Deus Belém",
    sobrenome: "Lins",
    publicCode: "adbelem~lins",
    inicio: "/igreja/adbelem/lins",
    cor: "#1d4ed8",
  });

  it("é um app próprio da igreja: nome dela, id e início no endereço dela", () => {
    expect(m.name).toBe("Assembleia de Deus Belém - Lins");
    expect(m.id).toBe("/igreja/adbelem/lins");
    expect(m.start_url).toBe(m.id);
    expect(m.scope).toBe(m.id);
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBe("#1d4ed8");
  });

  it("os ícones vêm da rota que desenha a logo, com o código escapado", () => {
    expect(m.icons.map((i) => i.src)).toEqual([
      "/api/igreja-app/icone?c=adbelem~lins&t=192",
      "/api/igreja-app/icone?c=adbelem~lins&t=512",
      "/api/igreja-app/icone?c=adbelem~lins&t=512&m=1",
    ]);
    expect(m.icons.at(-1)?.purpose).toBe("maskable");
  });

  it("cor inválida ou ausente vira a cor padrão", () => {
    expect(
      manifestoDaIgreja({ nome: "X", sobrenome: null, publicCode: "x", inicio: "/", cor: "red" }).theme_color,
    ).toBe("#41694b");
  });

  it("tamanhoDeIcone só aceita os tamanhos previstos", () => {
    expect(tamanhoDeIcone("512")).toBe(512);
    expect(tamanhoDeIcone("180")).toBe(180);
    expect(tamanhoDeIcone("9999")).toBe(192);
    expect(tamanhoDeIcone(null)).toBe(192);
  });
});
