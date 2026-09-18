import type { Metadata } from "next";
import { AlertTriangle, CircleDollarSign, HandCoins, Users } from "lucide-react";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { MetricCard } from "@/components/metric-card";
import { PreviewNotice } from "@/components/preview-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildRevenueSample } from "@/features/platform/mock-revenue";
import { ChargeStatusBadge } from "@/features/sponsor/components/status-badges";
import { formatCents } from "@/services/sponsorPricing";

export const metadata: Metadata = { title: "Visão geral" };

function igrejas(n: number): string {
  return n === 1 ? "1 igreja" : `${n} igrejas`;
}

/**
 * Visão geral da plataforma: o que entrou de patrocínio.
 *
 * Tudo nesta tela é AMOSTRA (src/features/platform/mock-revenue.ts) e não se
 * mistura número real no meio: "75 patrocinadores" ao lado de uma contagem de
 * verdade com 7 faria as duas perderem o sentido. O que é real na moderação —
 * as pendências — está nos badges do menu, fora do corpo desta página.
 */
export default function PlatformOverviewPage() {
  const amostra = buildRevenueSample();
  const subiu = amostra.variacaoMesAnterior >= 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          O que a plataforma recebe dos patrocinadores.
        </p>
      </div>

      <PreviewNotice>
        Os valores abaixo são uma amostra, calculada com a tabela de preços real para os números
        baterem entre si. A receita de verdade aparece aqui quando a cobrança for ligada.
      </PreviewNotice>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CircleDollarSign}
          label="Recebido no mês"
          value={formatCents(amostra.recebidoNoMesCents)}
          hint={`${subiu ? "+" : ""}${amostra.variacaoMesAnterior.toLocaleString("pt-BR")}% sobre o mês anterior`}
        />
        <MetricCard
          icon={Users}
          label="Patrocinadores ativos"
          value={amostra.patrocinadores}
          hint={`apoiando ${amostra.igrejasApoiadas} igrejas`}
        />
        <MetricCard
          icon={HandCoins}
          label="Ticket médio"
          value={formatCents(amostra.ticketMedioCents)}
          hint="por patrocinador, por mês"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Em aberto"
          value={formatCents(amostra.emAbertoCents)}
          hint={`${amostra.faturasAtrasadas} faturas atrasadas`}
        />
      </div>

      <BarChartCard
        title="Recebido por mês"
        description="Últimos 12 meses — o último é o mês corrente."
        data={amostra.porMes}
        xKey="mes"
        yKey="recebido"
        valueFormat={{ style: "currency", currency: "BRL", maximumFractionDigits: 0 }}
        height={260}
      />

      {/* Tabela, não gráfico: com quatro faixas, o que importa é o número
          exato de cada uma — e a barra ao lado já dá a proporção. */}
      <Card>
        <CardHeader>
          <CardTitle>De onde vem a receita</CardTitle>
          <CardDescription>
            Patrocinadores agrupados por quantas igrejas apoiam. Quem apoia mais paga menos por
            igreja, mas soma mais no total.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-4">
            {amostra.faixas.map((faixa) => (
              <li key={faixa.rotulo} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium">{faixa.rotulo}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {faixa.patrocinadores} patrocinadores ·{" "}
                    <span className="font-medium text-foreground">
                      {formatCents(faixa.receitaCents)}/mês
                    </span>{" "}
                    · {faixa.participacao.toLocaleString("pt-BR")}%
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-chart-1"
                    style={{ width: `${faixa.participacao}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Últimos pagamentos</CardTitle>
          <CardDescription>Uma cobrança por patrocinador por mês, somando as igrejas dele.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patrocinador</TableHead>
                  <TableHead>Igrejas</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {amostra.ultimosPagamentos.map((pagamento) => (
                  <TableRow key={pagamento.patrocinador}>
                    <TableCell className="font-medium">{pagamento.patrocinador}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {igrejas(pagamento.igrejas)}
                    </TableCell>
                    <TableCell>
                      <ChargeStatusBadge status={pagamento.situacao} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{pagamento.data}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(pagamento.valorCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mesma informação em cards no celular: tabela de 5 colunas não cabe. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {amostra.ultimosPagamentos.map((pagamento) => (
              <li key={pagamento.patrocinador} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{pagamento.patrocinador}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {igrejas(pagamento.igrejas)} · {pagamento.data}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">
                    {formatCents(pagamento.valorCents)}
                  </p>
                </div>
                <div className="mt-2">
                  <ChargeStatusBadge status={pagamento.situacao} />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
