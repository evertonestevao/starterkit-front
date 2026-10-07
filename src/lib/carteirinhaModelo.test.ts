import { describe, expect, it } from "vitest";
import type { CarteirinhaModelo } from "@/types/carteirinha";
import {
  CAMPOS_CARTEIRINHA,
  HEX_RE,
  LAYOUTS,
  MODELO_PADRAO,
  PALETAS,
  cargosDaCarteirinha,
  carteirinhaDeExemplo,
  claraDemais,
  corSobre,
  hexParaRgb,
  informacoesDaCarteirinha,
  isCampo,
  isLayout,
  logoDaCarteirinha,
  resolverModelo,
} from "./carteirinhaModelo";

const modelo = (over: Partial<CarteirinhaModelo> = {}): CarteirinhaModelo => ({ ...MODELO_PADRAO, ...over });
const membro = { membroDesde: "2005-01-09", batismo: "2004-11-21", nascimento: "1985-03-12", estadoCivil: "casado" };

describe("catálogo", () => {
  it("três desenhos e cinco informações, todos reconhecidos", () => {
    expect(LAYOUTS.map((l) => l.chave)).toEqual(["classico", "lateral", "minimalista"]);
    expect(CAMPOS_CARTEIRINHA.map((c) => c.chave)).toEqual([
      "cargos",
      "membro_desde",
      "batismo",
      "nascimento",
      "estado_civil",
    ]);
    expect(isLayout("lateral")).toBe(true);
    expect(isLayout("holografico")).toBe(false);
    expect(isCampo("batismo")).toBe(true);
    expect(isCampo("whatsapp")).toBe(false);
  });

  it("as paletas prontas e o padrão têm cores válidas, no formato do banco", () => {
    for (const cor of [...PALETAS.flatMap((p) => [p.corPrimaria, p.corDestaque]), MODELO_PADRAO.corPrimaria]) {
      expect(cor).toMatch(HEX_RE);
      expect(cor).toBe(cor.toLowerCase());
    }
  });
});

describe("resolverModelo", () => {
  it("sem modelo gravado vale o padrão", () => {
    expect(resolverModelo(null)).toBe(MODELO_PADRAO);
  });

  it("título em branco cai no título padrão; o resto fica", () => {
    const m = resolverModelo(modelo({ titulo: "  ", layout: "lateral", corPrimaria: "#112233" }));
    expect(m.titulo).toBe(MODELO_PADRAO.titulo);
    expect(m).toMatchObject({ layout: "lateral", corPrimaria: "#112233" });
  });
});

describe("cores", () => {
  it("converte o código em RGB; código inválido vira preto", () => {
    expect(hexParaRgb("#1a2B3c")).toEqual([26, 43, 60]);
    expect(hexParaRgb("vermelho")).toEqual([0, 0, 0]);
    expect(hexParaRgb("#fff")).toEqual([0, 0, 0]);
  });

  it("texto branco sobre cor escura, escuro sobre cor clara", () => {
    expect(corSobre("#2a5440")).toBe("#ffffff");
    expect(corSobre("#000000")).toBe("#ffffff");
    expect(corSobre("#ffe45c")).toBe("#111827");
    expect(corSobre("#ffffff")).toBe("#111827");
    expect(claraDemais("#ffe45c")).toBe(true);
    expect(claraDemais("#6b1f2a")).toBe(false);
  });

  it("todas as paletas prontas dão texto branco sobre a cor principal", () => {
    for (const p of PALETAS) expect(corSobre(p.corPrimaria)).toBe("#ffffff");
  });
});

describe("informações", () => {
  it("só as que o modelo mostra, na ordem do catálogo", () => {
    const m = modelo({ campos: ["estado_civil", "batismo", "cargos"] });
    expect(informacoesDaCarteirinha(membro, m)).toEqual([
      { rotulo: "Batismo", valor: "21/11/2004" },
      { rotulo: "Estado civil", valor: "Casado(a)" },
    ]);
  });

  it("informação que o membro não tem não aparece (nem como traço)", () => {
    const m = modelo({ campos: ["membro_desde", "batismo", "nascimento"] });
    expect(informacoesDaCarteirinha({ ...membro, batismo: null, nascimento: null }, m)).toEqual([
      { rotulo: "Membro desde", valor: "09/01/2005" },
    ]);
  });

  it("os cargos só saem se o modelo os mostra", () => {
    expect(cargosDaCarteirinha({ cargos: "Diácono" }, modelo({ campos: ["cargos"] }))).toBe("Diácono");
    expect(cargosDaCarteirinha({ cargos: "Diácono" }, modelo({ campos: [] }))).toBeNull();
  });

  it("o exemplo tem tudo preenchido, para a prévia mostrar qualquer escolha", () => {
    const m = modelo({ campos: CAMPOS_CARTEIRINHA.map((c) => c.chave) });
    const ex = carteirinhaDeExemplo(
      { nome: "Igreja X", sobrenome: null, pastor: null, logoUrl: "https://x/logo.png" },
      m,
      "2027-10-07",
    );
    expect(logoDaCarteirinha(ex, m)).toBe("https://x/logo.png");
    expect(logoDaCarteirinha(ex, modelo({ mostrarLogo: false }))).toBeNull();
    expect(informacoesDaCarteirinha(ex, m)).toHaveLength(4);
    expect(cargosDaCarteirinha(ex, m)).not.toBeNull();
    expect(ex.pastor).toBe("Nome do Pastor");
    expect(ex.modelo).toBe(m);
  });
});
