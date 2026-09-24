/**
 * Aparência da página pública da igreja (sem I/O): as três paletas prontas e
 * a cor de destaque que a igreja pode escolher por cima delas.
 *
 * A cor é livre, então o contraste não pode ser. O mesmo destaque vira texto
 * de link, fundo de botão e preenchimento de barra — e um amarelo-claro sobre
 * o tema claro, ou um azul-marinho sobre o escuro, some. Em vez de recusar a
 * escolha (que valeria para um tema e não para o outro, e a igreja pode
 * herdar o tema de outra), a cor é guardada como foi escolhida e AJUSTADA na
 * hora de desenhar, só o quanto precisa para ficar legível naquele fundo.
 */

export type ChurchTheme = "classico" | "clean" | "dark";

export const CHURCH_THEMES: ReadonlyArray<{ slug: ChurchTheme; label: string; hint: string }> = [
  { slug: "classico", label: "Clássico", hint: "Marinho e vinho, fundo creme" },
  { slug: "clean", label: "Clean", hint: "Claro, com verde sálvia" },
  { slug: "dark", label: "Dark", hint: "Grafite, com verde" },
];

/** Tema de quem nunca escolheu nada. */
export const DEFAULT_CHURCH_THEME: ChurchTheme = "dark";

/**
 * As paletas, como variáveis CSS. A página é uma só; muda a paleta. Contraste
 * de texto conferido em cada uma (AA). `--pg-accent*` é o destaque padrão do
 * tema, que a cor escolhida pela igreja substitui.
 */
export const THEME_PALETTES: Record<ChurchTheme, Record<string, string>> = {
  dark: {
    "--pg-bg": "#1a1a1a",
    "--pg-band": "#1f1f1f",
    "--pg-hero": "#161616",
    "--pg-hero-text": "#f4f4f4",
    "--pg-hero-muted": "#a9a9a9",
    "--pg-hero-accent": "#5ccf9b",
    "--pg-surface": "#242424",
    "--pg-surface-2": "#2b2b2b",
    "--pg-text": "#f1f1f1",
    "--pg-muted": "#a8a8a8",
    "--pg-border": "rgba(255, 255, 255, 0.08)",
    "--pg-accent": "#5ccf9b",
    "--pg-accent-fg": "#0b1a13",
    "--pg-accent-soft": "rgba(92, 207, 155, 0.13)",
    "--pg-danger": "#f2a097",
  },
  classico: {
    "--pg-bg": "#f6f1e8",
    "--pg-band": "#efe8db",
    "--pg-hero": "#1c2b3a",
    "--pg-hero-text": "#f6efe2",
    "--pg-hero-muted": "#cbc4b4",
    // Vinho sobre o marinho dava 1,6:1 — ilegível. No cabeçalho, dourado.
    "--pg-hero-accent": "#d9be7e",
    "--pg-surface": "#ffffff",
    "--pg-surface-2": "#fbf8f2",
    "--pg-text": "#1c2b3a",
    "--pg-muted": "#5b6470",
    "--pg-border": "rgba(28, 43, 58, 0.12)",
    "--pg-accent": "#7a2e3a",
    "--pg-accent-fg": "#fff8f0",
    "--pg-accent-soft": "rgba(122, 46, 58, 0.09)",
    "--pg-danger": "#a3322a",
  },
  clean: {
    "--pg-bg": "#f7f8f5",
    "--pg-band": "#eef2ec",
    "--pg-hero": "#e3ece4",
    "--pg-hero-text": "#1d2a21",
    "--pg-hero-muted": "#4d5c52",
    "--pg-hero-accent": "#36684a",
    "--pg-surface": "#ffffff",
    "--pg-surface-2": "#f8faf7",
    "--pg-text": "#1d2a21",
    "--pg-muted": "#58665c",
    "--pg-border": "rgba(29, 42, 33, 0.1)",
    "--pg-accent": "#36684a",
    "--pg-accent-fg": "#ffffff",
    "--pg-accent-soft": "rgba(54, 104, 74, 0.1)",
    "--pg-danger": "#a3322a",
  },
};

export function isChurchTheme(value: unknown): value is ChurchTheme {
  return value === "classico" || value === "clean" || value === "dark";
}

/** Sugestões para quem não quer procurar uma cor. Todas legíveis nos três temas depois do ajuste. */
export const ACCENT_PRESETS: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: "#059669", label: "Esmeralda" },
  { hex: "#2563eb", label: "Azul" },
  { hex: "#7c3aed", label: "Roxo" },
  { hex: "#be123c", label: "Vinho" },
  { hex: "#ea580c", label: "Laranja" },
  { hex: "#ca8a04", label: "Dourado" },
  { hex: "#0d9488", label: "Turquesa" },
  { hex: "#db2777", label: "Rosa" },
];

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

export type ParsedAccentColor = { ok: true; color: string | null } | { ok: false; message: string };

const MENSAGEM_COR = "Cor inválida. Escolha uma das sugestões ou use o formato #RRGGBB.";

/**
 * A cor vai parar dentro de um atributo `style`, então só entra hexadecimal:
 * nada de `url(...)`, `expression(...)` nem `;` que abra outra propriedade.
 * Vazio significa "usar a cor do tema".
 */
export function parseAccentColor(input: string): ParsedAccentColor {
  const texto = input.trim().toLowerCase();
  if (texto === "") return { ok: true, color: null };

  const curto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(texto);
  if (curto) return { ok: true, color: `#${curto[1]}${curto[1]}${curto[2]}${curto[2]}${curto[3]}${curto[3]}` };
  if (/^#[0-9a-f]{6}$/.test(texto)) return { ok: true, color: texto };
  return { ok: false, message: MENSAGEM_COR };
}

// ---------------------------------------------------------------------------
// Contraste (WCAG 2.x)
// ---------------------------------------------------------------------------

type Rgb = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
  const parte = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${parte(r)}${parte(g)}${parte(b)}`;
}

function luminance([r, g, b]: Rgb): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  const [claro, escuro] = la >= lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255];
}

/**
 * A cor, escurecida ou clareada só o necessário para ter `minimo`:1 de
 * contraste sobre `fundo`. Mantém o matiz — o azul continua azul —, mexe na
 * luminosidade. Fundo escuro clareia; fundo claro escurece.
 */
export function readableOn(cor: string, fundo: string, minimo = 4.5): string {
  if (contrastRatio(cor, fundo) >= minimo) return cor;

  const [h, s, l0] = rgbToHsl(hexToRgb(cor));
  const passo = luminance(hexToRgb(fundo)) < 0.5 ? 0.01 : -0.01;
  let l = l0;
  for (let i = 0; i < 100; i += 1) {
    l = Math.min(1, Math.max(0, l + passo));
    const candidata = rgbToHex(hslToRgb([h, s, l]));
    if (contrastRatio(candidata, fundo) >= minimo) return candidata;
  }
  // Não acontece com fundos reais (branco/preto chegam a 21:1), mas o
  // contrato é "sempre devolve algo legível".
  return passo > 0 ? "#ffffff" : "#000000";
}

/** Texto sobre a cor de destaque: escuro ou branco, o que contrastar mais. */
export function foregroundOn(cor: string): string {
  return contrastRatio(cor, "#111111") >= contrastRatio(cor, "#ffffff") ? "#111111" : "#ffffff";
}

function rgba(hex: string, alfa: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

/**
 * As variáveis CSS da página: a paleta do tema e, se a igreja escolheu uma
 * cor, o destaque dela já ajustado ao fundo daquele tema.
 */
export function buildPageStyle(theme: ChurchTheme, accent: string | null): Record<string, string> {
  const paleta = THEME_PALETTES[theme];
  if (!accent) return { ...paleta };

  // O destaque aparece sobre o fundo da página e sobre o cabeçalho; cada um
  // ganha o ajuste que precisa (o cabeçalho do Clássico é marinho; o do
  // Clean, claro).
  const noFundo = readableOn(accent, paleta["--pg-bg"]);
  const noCabecalho = readableOn(accent, paleta["--pg-hero"]);
  return {
    ...paleta,
    "--pg-accent": noFundo,
    "--pg-accent-fg": foregroundOn(noFundo),
    "--pg-accent-soft": rgba(noFundo, 0.13),
    "--pg-hero-accent": noCabecalho,
  };
}
