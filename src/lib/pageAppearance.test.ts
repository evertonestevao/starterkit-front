import { describe, expect, it } from "vitest";
import {
  ACCENT_PRESETS,
  buildPageStyle,
  contrastRatio,
  foregroundOn,
  isChurchTheme,
  parseAccentColor,
  readableOn,
  THEME_PALETTES,
  type ChurchTheme,
} from "./pageAppearance";

const TEMAS: ChurchTheme[] = ["classico", "clean", "dark"];

describe("parseAccentColor", () => {
  it("vazio significa usar a cor do tema", () => {
    expect(parseAccentColor("")).toEqual({ ok: true, color: null });
    expect(parseAccentColor("   ")).toEqual({ ok: true, color: null });
  });

  it("normaliza para #rrggbb minúsculo, inclusive a forma curta", () => {
    expect(parseAccentColor("#2563EB")).toEqual({ ok: true, color: "#2563eb" });
    expect(parseAccentColor(" #F0a ")).toEqual({ ok: true, color: "#ff00aa" });
  });

  it("recusa qualquer coisa que não seja hexadecimal — a cor vai para dentro de um style", () => {
    for (const ruim of [
      "red",
      "2563eb",
      "#25",
      "#2563eb;background:url(//x)",
      "#2563eb)",
      "url(javascript:alert(1))",
      "rgb(1,2,3)",
      "#gggggg",
      "#12345678",
    ]) {
      expect(parseAccentColor(ruim).ok, ruim).toBe(false);
    }
  });
});

describe("contraste", () => {
  it("preto no branco é 21:1 e é simétrico", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("readableOn não mexe em cor que já é legível", () => {
    expect(readableOn("#ffffff", "#1a1a1a")).toBe("#ffffff");
  });

  it("clareia sobre fundo escuro e escurece sobre fundo claro, mantendo o contraste mínimo", () => {
    const naEscuro = readableOn("#1e3a8a", "#1a1a1a");
    const naClara = readableOn("#fde047", "#f6f1e8");

    expect(contrastRatio(naEscuro, "#1a1a1a")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(naClara, "#f6f1e8")).toBeGreaterThanOrEqual(4.5);
    // Escuro virou mais claro, e claro virou mais escuro.
    expect(contrastRatio(naEscuro, "#000000")).toBeGreaterThan(contrastRatio("#1e3a8a", "#000000"));
    expect(contrastRatio(naClara, "#000000")).toBeLessThan(contrastRatio("#fde047", "#000000"));
  });

  it("foregroundOn escolhe o texto que mais contrasta", () => {
    expect(foregroundOn("#fde047")).toBe("#111111");
    expect(foregroundOn("#1e3a8a")).toBe("#ffffff");
  });
});

describe("buildPageStyle", () => {
  it("sem cor escolhida, devolve a paleta do tema sem tocar nela", () => {
    for (const tema of TEMAS) {
      expect(buildPageStyle(tema, null)).toEqual(THEME_PALETTES[tema]);
    }
  });

  it("qualquer cor, em qualquer tema, fica legível como texto e como botão", () => {
    const cores = [...ACCENT_PRESETS.map((p) => p.hex), "#000000", "#ffffff", "#fde047", "#0a0a0a", "#808080"];
    for (const tema of TEMAS) {
      for (const cor of cores) {
        const estilo = buildPageStyle(tema, cor);
        const bg = THEME_PALETTES[tema]["--pg-bg"];
        const hero = THEME_PALETTES[tema]["--pg-hero"];

        expect(contrastRatio(estilo["--pg-accent"], bg), `${tema} ${cor} texto`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(estilo["--pg-accent-fg"], estilo["--pg-accent"]), `${tema} ${cor} botão`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(estilo["--pg-hero-accent"], hero), `${tema} ${cor} cabeçalho`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("a cor escolhida só troca o destaque: o resto da paleta segue igual", () => {
    const destaque = ["--pg-accent", "--pg-accent-fg", "--pg-accent-soft", "--pg-hero-accent"];
    const semDestaque = (estilo: Record<string, string>) =>
      Object.fromEntries(Object.entries(estilo).filter(([chave]) => !destaque.includes(chave)));

    const estilo = buildPageStyle("clean", "#2563eb");

    expect(semDestaque(estilo)).toEqual(semDestaque(THEME_PALETTES.clean));
    expect(estilo["--pg-accent"]).not.toBe(THEME_PALETTES.clean["--pg-accent"]);
  });
});

describe("isChurchTheme", () => {
  it("só aceita os três temas", () => {
    expect(isChurchTheme("dark")).toBe(true);
    expect(isChurchTheme("classico")).toBe(true);
    expect(isChurchTheme("neon")).toBe(false);
    expect(isChurchTheme(null)).toBe(false);
  });
});
