import type { CSSProperties, ReactNode } from "react";
import { Outfit } from "next/font/google";
import type { ChurchTheme } from "@/server/publicChurch";

/**
 * Invólucro visual das telas públicas da igreja (página, eventos, detalhe do
 * evento): a paleta do tema dela e a fonte dos títulos. Uma fonte só de
 * verdade, para as três telas não divergirem.
 */

export const fonteTitulos = Outfit({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });

/**
 * As três aparências que a igreja pode escolher, como variáveis CSS. A página
 * é uma só; muda a paleta. Contraste de texto conferido em cada uma (AA).
 */
const PALETAS: Record<ChurchTheme, Record<string, string>> = {
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

export function PublicShell({ theme, children }: { theme: ChurchTheme; children: ReactNode }) {
  return (
    <div
      style={PALETAS[theme] as CSSProperties}
      className="min-h-svh bg-[var(--pg-bg)] text-[var(--pg-text)]"
    >
      {children}
    </div>
  );
}
