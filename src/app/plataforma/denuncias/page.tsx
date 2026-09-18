import type { Metadata } from "next";
import { EyeOff, Flag, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AbuseReportReview } from "@/features/platform/components/abuse-report-review";
import { getPlatformModerationService } from "@/server/platform";

export const metadata: Metadata = { title: "Denúncias" };

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function PlatformReportsPage() {
  const service = await getPlatformModerationService();
  const [denuncias, sinais] = await Promise.all([
    service.listAbuseReports(),
    service.listHiddenSignals(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Denúncias</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Casos que uma igreja pediu para a plataforma olhar. Esconder um patrocinador é decisão de
          cada igreja e não passa por aqui — decidir uma denúncia também não esconde ninguém.
        </p>
      </div>

      {/* O sinal vem antes da fila porque costuma chegar antes do problema. */}
      {sinais.length > 0 ? (
        <Alert>
          <EyeOff className="size-4" />
          <AlertDescription className="flex flex-col gap-1">
            <span className="font-medium">Escondidos por mais de uma igreja</span>
            {sinais.map((sinal) => (
              <span key={sinal.sponsorAccountId} className="text-sm">
                {sinal.sponsorName} ({sinal.sponsorEmail}) — {sinal.igrejasQueEsconderam} igrejas
              </span>
            ))}
            <span className="text-xs text-muted-foreground">
              Uma igreja esconder é gosto. Várias esconderem a mesma marca costuma ser problema.
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {denuncias.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nenhuma denúncia aberta"
          description="Quando uma igreja denunciar um patrocinador, o caso aparece aqui e você recebe um email."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {denuncias.map((report) => (
            <Card key={report.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <Flag className="size-4 text-destructive" aria-hidden />
                  {report.sponsorName}
                  <Badge variant="outline">{report.churchName}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {report.sponsorEmail} · denunciado em {formatDateTime(report.createdAt)}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <blockquote className="border-l-2 pl-3 text-sm leading-6 text-muted-foreground italic">
                  {report.motivo}
                </blockquote>
                <AbuseReportReview report={report} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
