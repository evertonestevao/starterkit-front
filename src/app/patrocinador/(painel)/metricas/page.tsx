import type { Metadata } from "next";
import { Eye, FlaskConical, MousePointerClick, TrendingUp, Users } from "lucide-react";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { DonutChartCard } from "@/components/charts/donut-chart-card";
import { LineChartCard } from "@/components/charts/line-chart-card";
import { MetricCard } from "@/components/metric-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { clickRatePercent, SPONSOR_METRICS_SAMPLE } from "@/features/sponsor/mock-metrics";

export const metadata: Metadata = { title: "Métricas" };

const integer = { maximumFractionDigits: 0 } as const;

export default async function SponsorMetricsPage() {
  // Tudo nesta tela é amostra (ver src/features/sponsor/mock-metrics.ts).
  // De propósito NÃO se mistura número real aqui: "1 igreja no seu plano"
  // ao lado de uma tabela de exemplo com 3 igrejas só confunde.
  const sample = SPONSOR_METRICS_SAMPLE;
  const clickRate = clickRatePercent(sample);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Métricas</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Quanto a sua marca apareceu para quem visitou as páginas das igrejas que você apoia.
        </p>
      </div>

      {/* O rótulo fica no topo, antes de qualquer número: ninguém deve
          confundir amostra com medição. */}
      <Alert>
        <FlaskConical className="size-4" />
        <AlertDescription>
          <strong className="font-medium text-foreground">Dados de demonstração.</strong> Os
          números abaixo são um exemplo do que esta tela vai mostrar. A medição real começa
          quando as páginas públicas passarem a registrar visitas, cliques e leituras de QR Code.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Eye}
          label="Aparições da marca"
          value={sample.appearances.toLocaleString("pt-BR")}
          hint="últimos 30 dias"
        />
        <MetricCard
          icon={Users}
          label="Pessoas alcançadas"
          value={sample.reach.toLocaleString("pt-BR")}
          hint="visitantes distintos"
        />
        <MetricCard
          icon={MousePointerClick}
          label="Cliques no seu perfil"
          value={sample.clicks.toLocaleString("pt-BR")}
          hint={`${clickRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% das aparições`}
        />
        <MetricCard
          icon={TrendingUp}
          label="Variação no mês"
          value={`+${sample.appearancesTrendPercent}%`}
          hint="contra os 30 dias anteriores"
        />
      </div>

      {/* Uma série por gráfico: aparições e cliques têm ordens de grandeza
          diferentes e não dividem o mesmo eixo. */}
      <LineChartCard
        title="Aparições por mês"
        description="Evolução da exposição da sua marca nos últimos 6 meses."
        data={sample.monthly}
        xKey="month"
        yKey="appearances"
        valueFormat={integer}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChartCard
          title="Aparições por igreja"
          description="Onde sua marca apareceu mais no período."
          data={sample.byChurch}
          xKey="church"
          yKey="appearances"
          valueFormat={integer}
        />
        <DonutChartCard
          title="Como chegaram até a página"
          description="Origem das visitas em que sua marca apareceu."
          data={sample.sources.map((source) => ({ label: source.label, value: source.value }))}
          valueFormat={integer}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalhe por igreja</CardTitle>
          <CardDescription>
            Aparições e cliques de cada comunidade apoiada, no período.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Desktop: tabela. Mobile: cards (regra de layout do projeto). */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Igreja</TableHead>
                  <TableHead className="text-right">Aparições</TableHead>
                  <TableHead className="text-right">Cliques</TableHead>
                  <TableHead className="text-right">Taxa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sample.byChurch.map((row) => (
                  <TableRow key={row.church}>
                    <TableCell className="font-medium">{row.church}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.appearances.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.clicks.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {((row.clicks / row.appearances) * 100).toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}
                      %
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {sample.byChurch.map((row) => (
              <div key={row.church} className="rounded-lg border p-3">
                <p className="font-medium">{row.church}</p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Aparições</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      {row.appearances.toLocaleString("pt-BR")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Cliques</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      {row.clicks.toLocaleString("pt-BR")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Taxa</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      {((row.clicks / row.appearances) * 100).toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}
                      %
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
