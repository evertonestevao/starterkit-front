"use client";

import { useId } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Gráfico de linha genérico do starter — infraestrutura, sem dados de
 * negócio. Lê as cores dos tokens --chart-1..5 (validados para light/dark e
 * daltonismo), então cada produto usa com seus próprios dados:
 *
 *   <LineChartCard
 *     title="Consultas por mês"
 *     data={rows}
 *     xKey="month"
 *     series={[{ key: "agendadas", label: "Agendadas" }, { key: "realizadas" }]}
 *   />
 *
 * Regras que o componente já cumpre (não desfazer ao customizar):
 * - máximo 5 séries (a paleta categórica tem 5 posições; mais que isso vira
 *   agregação "outros" ou small multiples — responsabilidade do chamador);
 * - cor segue a POSIÇÃO da série na lista, fixa, nunca reciclada;
 * - um único eixo Y (duas escalas = dois gráficos);
 * - legenda só com 2+ séries (com 1, o título nomeia a série);
 * - texto sempre em tokens de texto (nunca na cor da série).
 */

const SERIES_TOKENS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export interface ChartSeries {
  /** Chave numérica nos objetos de `data`. */
  key: string;
  /** Rótulo exibido (default: a própria chave). */
  label?: string;
}

export interface LineChartCardProps {
  title: string;
  description?: string;
  data: Array<Record<string, unknown>>;
  /** Chave do eixo X nos objetos de `data`. */
  xKey: string;
  /** Uma série (yKey) ou várias (series). Informe apenas um dos dois. */
  yKey?: string;
  series?: Array<string | ChartSeries>;
  /** Formatação dos valores (tooltip e eixo Y). */
  valueFormatter?: (value: number) => string;
  /** Altura da área do gráfico em px (default 240). */
  height?: number;
}

function normalizeSeries(props: LineChartCardProps): ChartSeries[] {
  const raw = props.series ?? (props.yKey ? [props.yKey] : []);
  const normalized = raw.map((s) => (typeof s === "string" ? { key: s } : s));
  if (normalized.length > SERIES_TOKENS.length) {
    console.warn(
      `[LineChartCard] ${normalized.length} séries: só as ${SERIES_TOKENS.length} primeiras são plotadas — agregue o restante em "outros" ou use gráficos separados.`,
    );
  }
  return normalized.slice(0, SERIES_TOKENS.length);
}

export function LineChartCard(props: LineChartCardProps) {
  const {
    title,
    description,
    data,
    xKey,
    valueFormatter = (v) => String(v),
    height = 240,
  } = props;
  const series = normalizeSeries(props);
  const chartId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {series.length >= 2 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legenda">
            {series.map((s, i) => (
              <li key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: SERIES_TOKENS[i] }}
                  aria-hidden
                />
                {s.label ?? s.key}
              </li>
            ))}
          </ul>
        ) : null}

        <div style={{ height }} aria-describedby={chartId}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              {/* Grid recessivo: só linhas horizontais, na cor de borda. */}
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey={xKey}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickMargin={8}
              />
              <YAxis
                width={48}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickFormatter={(v: number) => valueFormatter(v)}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                      <p className="mb-1 font-medium">{String(label)}</p>
                      {payload.map((entry, i) => (
                        <p key={String(entry.dataKey)} className="flex items-center gap-1.5">
                          <span
                            className="inline-block size-2 rounded-full"
                            style={{ backgroundColor: SERIES_TOKENS[i] }}
                            aria-hidden
                          />
                          <span className="text-muted-foreground">
                            {series[i]?.label ?? String(entry.dataKey)}:
                          </span>
                          <span className="font-medium tabular-nums">
                            {valueFormatter(Number(entry.value))}
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : null
                }
              />
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label ?? s.key}
                  stroke={SERIES_TOKENS[i]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* Acessibilidade: descrição textual do que o gráfico mostra. */}
        <p id={chartId} className="sr-only">
          {title}. Gráfico de linha com {series.length} série
          {series.length === 1 ? "" : "s"}: {series.map((s) => s.label ?? s.key).join(", ")}.
        </p>
      </CardContent>
    </Card>
  );
}
