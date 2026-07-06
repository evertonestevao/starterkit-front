/**
 * Base compartilhada dos componentes de gráfico do starter.
 * As cores vêm dos tokens --chart-1..5 (globals.css), validados para
 * light/dark, daltonismo e contraste — a cor segue a POSIÇÃO da série,
 * fixa, nunca reciclada. Mais de 5 séries/fatias = agregue em "Outros".
 */

export const SERIES_TOKENS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export const MAX_SERIES = SERIES_TOKENS.length;

export interface ChartSeries {
  /** Chave numérica nos objetos de `data`. */
  key: string;
  /** Rótulo exibido (default: a própria chave). */
  label?: string;
}

/** Formatação serializável (usável a partir de Server Components). */
export type ValueFormat = Intl.NumberFormatOptions & { locale?: string };

export function resolveFormatter(
  valueFormatter: ((value: number) => string) | undefined,
  valueFormat: ValueFormat | undefined,
): (value: number) => string {
  if (valueFormatter) return valueFormatter;
  if (valueFormat) {
    return (v: number) => v.toLocaleString(valueFormat.locale ?? "pt-BR", valueFormat);
  }
  return (v: number) => String(v);
}

export function normalizeSeriesList(
  raw: Array<string | ChartSeries>,
  componentName: string,
): ChartSeries[] {
  const normalized = raw.map((s) => (typeof s === "string" ? { key: s } : s));
  if (normalized.length > MAX_SERIES) {
    console.warn(
      `[${componentName}] ${normalized.length} séries: só as ${MAX_SERIES} primeiras são plotadas — agregue o restante em "outros" ou use gráficos separados.`,
    );
  }
  return normalized.slice(0, MAX_SERIES);
}

/** Legenda compartilhada: bolinha na cor da série, texto em token de texto. */
export function ChartLegend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legenda">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
