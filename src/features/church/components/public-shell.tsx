import type { CSSProperties, ReactNode } from "react";
import { Outfit } from "next/font/google";
import { buildPageStyle, type ChurchTheme } from "@/lib/pageAppearance";

/**
 * Invólucro visual das telas públicas da igreja (página, eventos, detalhe do
 * evento): a paleta do tema dela (com a cor de destaque, se escolheu uma) e a
 * fonte dos títulos. Uma fonte só de verdade, para as três telas não divergirem.
 */

export const fonteTitulos = Outfit({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });

export function PublicShell({
  theme,
  accent = null,
  children,
}: {
  theme: ChurchTheme;
  /** Cor de destaque escolhida pela igreja (#rrggbb); null usa a do tema. */
  accent?: string | null;
  children: ReactNode;
}) {
  return (
    <div
      style={buildPageStyle(theme, accent) as CSSProperties}
      className="min-h-svh bg-[var(--pg-bg)] text-[var(--pg-text)]"
    >
      {children}
    </div>
  );
}
