"use client";

import { useId } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MAX_SERIES, resolveFormatter, SERIES_TOKENS, type ValueFormat } from "./chart-base";

/**
 * DONUT genérico do starter (composição de um todo — ex.: distribuição por
 * plano). Exemplos com dados fake: src/app/dashboard/page.tsx.
 *
 * Regras: máximo 5 fatias — excedentes são AGREGADAS em "Outros"
 * automaticamente (composição com muitas categorias não se lê num donut);
 * gap de 2px entre fatias na cor do card; valores na legenda ao lado,
 * nunca escritos por cima das fatias.
 */

export interface DonutSlice {
  label: string;
  value: number;
}

export interface DonutChartCardProps {
  title: string;
  description?: string;
  data: DonutSlice[];
  valueFormatter?: (value: number) => string;
  valueFormat?: ValueFormat;
  height?: number;
}

function foldExcessSlices(data: DonutSlice[]): DonutSlice[] {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_SERIES) return sorted;
  const kept = sorted.slice(0, MAX_SERIES - 1);
  const rest = sorted.slice(MAX_SERIES - 1).reduce((sum, s) => sum + s.value, 0);
  return [...kept, { label: "Outros", value: rest }];
}

export function DonutChartCard(props: DonutChartCardProps) {
  const { title, description, height = 200 } = props;
  const valueFormatter = resolveFormatter(props.valueFormatter, props.valueFormat);
  const slices = foldExcessSlices(props.data);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const chartId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-6">
          <div style={{ height, width: height }} className="shrink-0" aria-describedby={chartId}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                        <span className="text-muted-foreground">{payload[0].name}: </span>
                        <span className="font-medium tabular-nums">
                          {valueFormatter(Number(payload[0].value))}
                        </span>
                      </div>
                    ) : null
                  }
                />
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="62%"
                  outerRadius="100%"
                  // gap de 2px entre fatias, na cor do card (spacer)
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices.map((slice, i) => (
                    <Cell key={slice.label} fill={SERIES_TOKENS[i]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legenda com valor e percentual — identidade nunca só pela cor. */}
          <ul className="flex min-w-40 flex-1 flex-col gap-2" aria-label="Legenda">
            {slices.map((slice, i) => (
              <li key={slice.label} className="flex items-center gap-2 text-sm">
                <span
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: SERIES_TOKENS[i] }}
                  aria-hidden
                />
                <span className="truncate text-muted-foreground">{slice.label}</span>
                <span className="ml-auto font-medium tabular-nums">
                  {valueFormatter(slice.value)}
                </span>
                <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                  {total > 0 ? `${Math.round((slice.value / total) * 100)}%` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p id={chartId} className="sr-only">
          {title}. Composição: {slices.map((s) => `${s.label} ${valueFormatter(s.value)}`).join(", ")}.
        </p>
      </CardContent>
    </Card>
  );
}
