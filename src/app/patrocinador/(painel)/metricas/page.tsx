import type { Metadata } from "next";
import { Church, Eye } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMonthShort, lastMonths, pivotVisitsByChurch } from "@/lib/visitMetrics";
import { getVisitMetricsRepository } from "@/server/churchVisits";

export const metadata: Metadata = { title: "Métricas" };

const MESES = 6;

/**
 * Visitas às páginas das igrejas apoiadas, por mês — só enquanto a marca
 * estava no ar (depois de ativar, antes de terminar e antes de a igreja
 * esconder). É medição real, gravada desde a migration 20260921110000.
 *
 * Cliques na marca ficam de fora de propósito: hoje a marca na página da
 * igreja não leva a lugar nenhum, então não existe clique para contar.
 */
export default async function SponsorMetricsPage() {
  const repo = await getVisitMetricsRepository();
  const months = lastMonths(MESES);
  const rows = pivotVisitsByChurch(await repo.listSponsorChurchVisits(MESES), months);

  const noMes = rows.reduce((sum, row) => sum + row.porMes[0], 0);
  const noPeriodo = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Métricas</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Quantas vezes a página de cada igreja que você apoia foi aberta enquanto a sua marca estava
          nela — pelo link, pelo QR Code ou pela tag NFC.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard
          icon={Eye}
          label="Visitas neste mês"
          value={noMes.toLocaleString("pt-BR")}
          hint="páginas abertas com a sua marca"
        />
        <MetricCard
          icon={Church}
          label={`Últimos ${MESES} meses`}
          value={noPeriodo.toLocaleString("pt-BR")}
          hint={`em ${rows.length} ${rows.length === 1 ? "igreja" : "igrejas"}`}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Eye}
          title="Nenhuma visita contada ainda"
          description="As visitas aparecem aqui quando alguém abrir a página de uma igreja enquanto o seu patrocínio estiver ativo."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Por igreja e por mês</CardTitle>
            <CardDescription>
              Uma pessoa abrindo a mesma página várias vezes seguidas conta uma vez.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Desktop: tabela. Mobile: cards (regra de layout do projeto). */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Igreja</TableHead>
                    {months.map((m) => (
                      <TableHead key={m} className="text-right">
                        {formatMonthShort(m)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.churchId}>
                      <TableCell className="font-medium">{row.churchName}</TableCell>
                      {row.porMes.map((n, i) => (
                        <TableCell key={months[i]} className="text-right tabular-nums">
                          {n.toLocaleString("pt-BR")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 md:hidden">
              {rows.map((row) => (
                <div key={row.churchId} className="rounded-lg border p-3">
                  <p className="font-medium">{row.churchName}</p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    {row.porMes.map((n, i) => (
                      <div key={months[i]}>
                        <dt className="text-muted-foreground">{formatMonthShort(months[i])}</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums">{n.toLocaleString("pt-BR")}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
