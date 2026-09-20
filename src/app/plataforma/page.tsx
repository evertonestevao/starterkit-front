import type { Metadata } from "next";
import { AlertTriangle, CircleDollarSign, QrCode, Repeat, Users } from "lucide-react";
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
import { getPixCopiesByWeek, getVisitMetricsRepository } from "@/server/churchVisits";
import { formatCents } from "@/services/sponsorPricing";

export const metadata: Metadata = { title: "Visão geral" };

const SEMANAS = 8;

function formatSemana(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Visão geral da plataforma: patrocínio, renovações e alcance das páginas.
 *
 * Tudo aqui é MEDIDO. A versão anterior desta tela era uma amostra calculada
 * em código, e amostra com cara de relatório é pior do que tela vazia: alguém
 * decide em cima dela.
 *
 * Doação não aparece: o dízimo é a chave PIX da própria igreja e não passa
 * pela plataforma, então não há valor para contar — só a intenção de doar
 * ("PIX copiado").
 */
export default async function PlatformOverviewPage() {
  const repo = await getVisitMetricsRepository();
  const [resumo, visitas, copiasPix] = await Promise.all([
    repo.getPilotSummary(),
    repo.listVisitsByWeek(SEMANAS),
    getPixCopiesByWeek(SEMANAS),
  ]);
  // Chave copiada é INTENÇÃO de doar: no v1 a doação vai direto para a igreja
  // e a plataforma não vê valor nenhum.
  const copiasPorSemana = new Map(copiasPix.map((c) => [`${c.semana}|${c.churchId}`, c.copias]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Patrocinadores, renovações e quantas vezes a página de cada igreja foi aberta. Números
          medidos, sem amostra.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Patrocinadores pagantes"
          value={resumo.patrocinadoresPagantes}
          hint={`${resumo.patrociniosNoAr} patrocínios no ar`}
        />
        <MetricCard
          icon={Repeat}
          label="Renovações"
          value={resumo.renovacoes}
          hint={`de ${resumo.cobrancasPagas} cobranças pagas`}
        />
        <MetricCard
          icon={CircleDollarSign}
          label="Recebido no mês"
          value={formatCents(resumo.recebidoMesCents)}
          hint="patrocínio pago desde o dia 1º"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Em atraso"
          value={resumo.patrocinadoresEmAtraso}
          hint="patrocinadores com fatura vencida"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aberturas da página por igreja e semana</CardTitle>
          <CardDescription>
            Últimas {SEMANAS} semanas. QR e NFC só aparecem separados quando o material impresso usa
            o endereço com a origem (?origem=qr ou ?origem=nfc). &quot;PIX copiado&quot; conta quem
            copiou a chave da igreja — é intenção de doar, não doação: o dinheiro vai direto para a
            igreja e a plataforma não vê valor nenhum.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {visitas.length === 0 ? (
            <EmptyState icon={QrCode} title="Nenhuma visita contada ainda" />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Semana</TableHead>
                      <TableHead>Igreja</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">QR</TableHead>
                      <TableHead className="text-right">NFC</TableHead>
                      <TableHead className="text-right">PIX copiado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visitas.map((v) => (
                      <TableRow key={`${v.semana}-${v.churchId}`}>
                        <TableCell className="tabular-nums">{formatSemana(v.semana)}</TableCell>
                        <TableCell className="font-medium">{v.churchName}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.qr}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.nfc}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {copiasPorSemana.get(`${v.semana}|${v.churchId}`) ?? 0}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-3 md:hidden">
                {visitas.map((v) => (
                  <div key={`${v.semana}-${v.churchId}`} className="rounded-lg border p-3">
                    <p className="font-medium">{v.churchName}</p>
                    <p className="text-xs text-muted-foreground">semana de {formatSemana(v.semana)}</p>
                    <p className="mt-1 text-sm tabular-nums">
                      {v.total} no total · {v.qr} QR · {v.nfc} NFC ·{" "}
                      {copiasPorSemana.get(`${v.semana}|${v.churchId}`) ?? 0} PIX copiado
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
