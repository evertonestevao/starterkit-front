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
import {
  ChartLegend,
  normalizeSeriesList,
  resolveFormatter,
  SERIES_TOKENS,
  type ChartSeries,
  type ValueFormat,
} from "./chart-base";

/**
 * Gráfico de LINHA genérico do starter (mudança ao longo do tempo) —
 * infraestrutura, sem dados de negócio. Exemplos de uso com dados fake:
 * src/app/dashboard/page.tsx (seção "Exemplos de gráficos").
 *
 * Regras que o componente já cumpre (não desfazer ao customizar):
 * - máximo 5 séries, cor fixa pela POSIÇÃO na lista (tokens --chart-1..5);
 * - um único eixo Y (duas escalas = dois gráficos);
 * - legenda só com 2+ séries (com 1, o título nomeia a série);
 * - texto sempre em tokens de texto (nunca na cor da série).
 */

export interface LineChartCardProps {
  title: string;
  description?: string;
  data: Array<Record<string, unknown>>;
  /** Chave do eixo X nos objetos de `data`. */
  xKey: string;
  /** Uma série (yKey) ou várias (series). Informe apenas um dos dois. */
  yKey?: string;
  series?: Array<string | ChartSeries>;
  /**
   * Formatação dos valores (tooltip e eixo Y).
   * ATENÇÃO: função NÃO pode ser passada por um Server Component (limitação
   * do React) — nesse caso use `valueFormat` (serializável) abaixo.
   */
  valueFormatter?: (value: number) => string;
  /** Formatação serializável via Intl.NumberFormat — ex.: { style: "currency", currency: "BRL" }. */
  valueFormat?: ValueFormat;
  /** Altura da área do gráfico em px (default 240). */
  height?: number;
}

export function LineChartCard(props: LineChartCardProps) {
  const { title, description, data, xKey, height = 240 } = props;
  const valueFormatter = resolveFormatter(props.valueFormatter, props.valueFormat);
  const series = normalizeSeriesList(
    props.series ?? (props.yKey ? [props.yKey] : []),
    "LineChartCard",
  );
  const chartId = useId();

  // Largura do eixo Y proporcional ao maior rótulo formatado (ex.: "R$ 3.800"),
  // senão valores longos são cortados. ~7.5px por caractere em fonte 12px.
  const longestLabel = data.reduce((longest, row) => {
    for (const s of series) {
      const value = row[s.key];
      if (typeof value === "number") {
        const label = valueFormatter(value);
        if (label.length > longest) longest = label.length;
      }
    }
    return longest;
  }, 1);
  const yAxisWidth = Math.min(110, Math.max(40, 14 + longestLabel * 7.5));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {series.length >= 2 ? (
          <ChartLegend
            items={series.map((s, i) => ({ label: s.label ?? s.key, color: SERIES_TOKENS[i] }))}
          />
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
                width={yAxisWidth}
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
