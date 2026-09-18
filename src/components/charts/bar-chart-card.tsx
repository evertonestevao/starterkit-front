"use client";

import { useId } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  yAxisWidthFor,
  type ChartSeries,
  type ValueFormat,
} from "./chart-base";

/**
 * Gráfico de BARRAS genérico do starter (comparação de magnitude entre
 * categorias). Exemplos com dados fake: src/app/dashboard/page.tsx.
 * Mesmas regras do LineChartCard: máx. 5 séries, cor fixa por posição,
 * eixo único, legenda só com 2+ séries, texto em tokens de texto.
 */

export interface BarChartCardProps {
  title: string;
  description?: string;
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKey?: string;
  series?: Array<string | ChartSeries>;
  valueFormatter?: (value: number) => string;
  valueFormat?: ValueFormat;
  height?: number;
}

export function BarChartCard(props: BarChartCardProps) {
  const { title, description, data, xKey, height = 240 } = props;
  const valueFormatter = resolveFormatter(props.valueFormatter, props.valueFormat);
  const series = normalizeSeriesList(
    props.series ?? (props.yKey ? [props.yKey] : []),
    "BarChartCard",
  );
  const chartId = useId();
  const yAxisWidth = yAxisWidthFor(data, series, valueFormatter);

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
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barGap={2}>
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
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
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
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label ?? s.key}
                  fill={SERIES_TOKENS[i]}
                  // topo arredondado ancorado na baseline; barras finas
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p id={chartId} className="sr-only">
          {title}. Gráfico de barras com {series.length} série
          {series.length === 1 ? "" : "s"}: {series.map((s) => s.label ?? s.key).join(", ")}.
        </p>
      </CardContent>
    </Card>
  );
}
