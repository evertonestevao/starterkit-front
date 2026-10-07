import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, Hourglass, PhoneCall, Users, XCircle } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { descreverQuando, formatarData, hojeISO, ultimaOcorrencia } from "@/lib/acompanhamento";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";
import { LegendaPresenca } from "@/components/legenda-presenca";

export const metadata: Metadata = { title: "Chamada e acompanhamento" };

export default async function AcompanhamentoResumoPage() {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();
  const service = await getAcompanhamentoService();
  const hoje = hojeISO();

  const [resumo, cultos, rede, sugestao] = await Promise.all([
    service.resumo(actor),
    service.listCultos(actor),
    service.resumoRede(actor),
    service.sugestao(actor),
  ]);
  // Os outros cultos com chamada, para quando a sugestão não for a certa.
  const outros = cultos
    .filter((c) => c.registraChamada && c.id !== sugestao?.culto.id)
    .map((c) => ({ culto: c, data: ultimaOcorrencia(c, hoje) }))
    .filter((c): c is { culto: typeof c.culto; data: string } => c.data !== null);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-primary" /> Fazer a chamada
          </CardTitle>
          <CardDescription>Sugerimos o culto pelo dia e horário. Todos começam como presentes; toque só em quem faltou.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!sugestao ? (
            <p className="text-sm text-muted-foreground">
              Nenhum culto com chamada na programação.{" "}
              <Link href="/dashboard/acompanhamento/cultos" className="font-medium text-primary underline">
                Ver cultos
              </Link>
            </p>
          ) : (
            <>
              <Link
                href={`/dashboard/acompanhamento/chamada/${sugestao.culto.id}?data=${sugestao.data}`}
                className="flex items-center justify-between gap-3 rounded-xl border-2 border-primary bg-primary/5 p-4 transition-colors hover:bg-primary/10"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-primary">
                    {sugestao.hoje ? "Culto de hoje" : "Último culto"}
                  </span>
                  <span className="block truncate text-lg font-semibold">{sugestao.culto.nome}</span>
                  <span className="block text-sm text-muted-foreground">
                    {formatarData(sugestao.data)} às {sugestao.culto.hora}
                  </span>
                </span>
                <span className={buttonVariants({ size: "lg" })}>Fazer chamada</span>
              </Link>
              {outros.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">Outro culto:</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {outros.map(({ culto, data }) => (
                      <Link
                        key={culto.id}
                        href={`/dashboard/acompanhamento/chamada/${culto.id}?data=${data}`}
                        className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{culto.nome}</span>
                          <span className="block text-xs text-muted-foreground">
                            {descreverQuando(culto)} · {formatarData(data)}
                          </span>
                        </span>
                        <span className={buttonVariants({ size: "sm", variant: "outline" })}>Chamada</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          {resumo.ultimaChamadaData
            ? `Último culto: ${resumo.ultimoCultoNome} em ${formatarData(resumo.ultimaChamadaData)}`
            : "Nenhuma chamada feita ainda"}
        </h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon={CheckCircle2} label="Presentes" value={resumo.presentes} hint={resumo.visitantes ? `+ ${resumo.visitantes} visitante(s)` : undefined} />
          <MetricCard icon={CalendarClock} label="Justificados" value={resumo.justificados} />
          <MetricCard icon={XCircle} label="Ausentes" value={resumo.ausentes} />
          <MetricCard icon={Users} label="Membros ativos" value={resumo.membrosAtivos} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link href="/dashboard/acompanhamento/alertas">
            <MetricCard icon={AlertTriangle} label="Membros em alerta" value={resumo.emAlerta} hint="faltas seguidas" />
          </Link>
          <Link href="/dashboard/acompanhamento/justificativas-longas">
            <MetricCard icon={Hourglass} label="Justificativas longas" value={resumo.justificativasLongas} hint="justificando há muito tempo" />
          </Link>
          <MetricCard icon={PhoneCall} label="Contatos pendentes" value={resumo.contatosPendentes} hint="ninguém falou ainda" />
        </div>
      </section>

      {rede.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Igrejas da rede</CardTitle>
            <CardDescription>
              Só números, no último culto de cada igreja. Nomes e motivos ficam com cada igreja (LGPD).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Igreja</TableHead>
                    <TableHead>Último culto</TableHead>
                    <TableHead className="text-right">Presentes</TableHead>
                    <TableHead className="text-right">Justif.</TableHead>
                    <TableHead className="text-right">Ausentes</TableHead>
                    <TableHead className="text-right">Em alerta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rede.map((r) => (
                    <TableRow key={r.churchId}>
                      <TableCell className="font-medium">{r.churchName}</TableCell>
                      <TableCell>{formatarData(r.ultimaChamadaData)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.presentes}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.justificados}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.ausentes}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.emAlerta}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <LegendaPresenca className="md:hidden" />
            <ul className="flex flex-col gap-2 md:hidden">
              {rede.map((r) => (
                <li key={r.churchId} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{r.churchName}</p>
                  <p className="text-muted-foreground">Último culto: {formatarData(r.ultimaChamadaData)}</p>
                  <p className="tabular-nums">
                    {r.presentes} P · {r.justificados} J · {r.ausentes} A · {r.emAlerta} em alerta
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
