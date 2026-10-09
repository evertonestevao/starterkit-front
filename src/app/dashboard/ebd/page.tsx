import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, FileDown } from "lucide-react";
import { DataAuto } from "@/components/data-auto";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData, formatarPercentual, hojeISO } from "@/lib/acompanhamento";
import { domingoSugerido, formatarReais, totaisDoDia, trimestreDe } from "@/lib/ebd";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import { LegendaPresenca } from "@/components/legenda-presenca";

export const metadata: Metadata = { title: "EBD" };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Verde quando a chamada já foi feita ("Abrir"); vermelho cheio quando falta fazer. */
function botaoDaChamada(feita: boolean): string {
  return feita
    ? buttonVariants({ size: "sm" })
    : cn(
        buttonVariants({ size: "sm", variant: "destructive" }),
        "bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive dark:hover:bg-destructive/90",
      );
}

export default async function EbdPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const actor = await getEbdActorAutorizado();
  if (!actor) notFound();
  const sp = await searchParams;
  const data = sp.data && DATA.test(sp.data) ? sp.data : domingoSugerido(hojeISO());

  const service = await getEbdService();
  const [resumo, trimestres, rede] = await Promise.all([
    service.resumoDoDia(actor, data),
    service.trimestres(actor),
    // Só números das igrejas abaixo; um complemento — se falhar, segue sem ele.
    service.resumoRede(actor).catch((err: unknown) => {
      console.error("[ebd] falha ao carregar a rede", err);
      return [];
    }),
  ]);
  const trimestre = trimestreDe(trimestres, data);
  const t = totaisDoDia(resumo);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="size-5 text-primary" /> Resumo do domingo
              </CardTitle>
              <CardDescription className="mt-1">
                {formatarData(data)} · {t.classesComChamada} de {resumo.length} classe(s) com chamada
                {trimestre ? ` · ${trimestre.nome}${trimestre.revista ? ` (${trimestre.revista})` : ""}` : ""}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DataAuto valor={data} rotulo="Domingo" />
              {/* <a> comum (não Link): é um arquivo para baixar, não uma página. */}
              <a
                href={`/dashboard/ebd/relatorio/pdf?data=${data}`}
                download={`ebd-relatorio-${data}.pdf`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <FileDown className="size-4" /> Baixar PDF
              </a>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Numero rotulo="Presentes" valor={t.presentes} detalhe={`de ${t.matriculados} matriculados`} />
            <Numero rotulo="Visitantes" valor={t.visitantes} />
            <Numero rotulo="Bíblias / revistas" valor={`${t.biblias} / ${t.revistas}`} />
            <Numero rotulo="Oferta" valor={formatarReais(t.ofertaCentavos)} />
          </div>

          {resumo.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma classe ativa.{" "}
              <Link href="/dashboard/ebd/classes" className="font-medium text-primary underline underline-offset-4">
                Abrir Classes
              </Link>
            </p>
          ) : (
            <>
              <LegendaPresenca
                extras={[
                  ["Matr.", "Matriculados"],
                  ["Visit.", "Visitantes"],
                ]}
              />
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Classe</TableHead>
                      <TableHead className="text-right">Matr.</TableHead>
                      <TableHead className="text-right">P</TableHead>
                      <TableHead className="text-right">A</TableHead>
                      <TableHead className="text-right">J</TableHead>
                      <TableHead className="text-right">Visit.</TableHead>
                      <TableHead className="text-right">Bíblias</TableHead>
                      <TableHead className="text-right">Revistas</TableHead>
                      <TableHead className="text-right">Oferta</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resumo.map((r) => (
                      <TableRow key={r.classeId}>
                        <TableCell className="font-medium">
                          <Link href={`/dashboard/ebd/classes/${r.classeId}`} className="hover:underline">
                            {r.classeNome}
                          </Link>
                          {r.chamadaFeita ? null : (
                            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal whitespace-nowrap text-muted-foreground">
                              Chamada pendente
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.matriculados}</TableCell>
                        {r.chamadaFeita ? (
                          <>
                            <TableCell className="text-right tabular-nums">{r.presentes}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.ausentes}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.justificados}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.visitantes}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.biblias}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.revistas}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatarReais(r.ofertaCentavos)}</TableCell>
                          </>
                        ) : (
                          // Um traço por coluna: a linha continua alinhada com o cabeçalho.
                          Array.from({ length: 7 }, (_, i) => (
                            <TableCell key={i} className="text-right text-muted-foreground" aria-label="sem dado">
                              –
                            </TableCell>
                          ))
                        )}
                        <TableCell className="text-right">
                          <Link
                            href={`/dashboard/ebd/classes/${r.classeId}/chamada?data=${data}`}
                            className={botaoDaChamada(r.chamadaFeita)}
                          >
                            {r.chamadaFeita ? "Abrir" : "Chamada"}
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {resumo.length > 1 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right tabular-nums">{t.matriculados}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.presentes}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.ausentes}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.justificados}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.visitantes}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.biblias}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.revistas}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatarReais(t.ofertaCentavos)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </div>
              <ul className="flex flex-col gap-2 md:hidden">
                {resumo.map((r) => (
                  <li key={r.classeId} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <Link href={`/dashboard/ebd/classes/${r.classeId}`} className="min-w-0">
                      <p className="truncate font-medium">{r.classeNome}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {r.chamadaFeita
                          ? `${r.presentes} P · ${r.ausentes} A · ${r.justificados} J · ${r.visitantes} visit. · ${formatarReais(r.ofertaCentavos)}`
                          : `${r.matriculados} matriculados · chamada pendente`}
                      </p>
                    </Link>
                    <Link
                      href={`/dashboard/ebd/classes/${r.classeId}/chamada?data=${data}`}
                      className={botaoDaChamada(r.chamadaFeita)}
                    >
                      {r.chamadaFeita ? "Abrir" : "Chamada"}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>


      {rede.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">EBD das igrejas da rede</CardTitle>
            <CardDescription>Só números. Nomes, responsáveis e cuidados ficam com cada igreja (LGPD).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Igreja</TableHead>
                    <TableHead className="text-right">Classes</TableHead>
                    <TableHead className="text-right">Alunos</TableHead>
                    <TableHead>Último domingo</TableHead>
                    <TableHead className="text-right">Presentes</TableHead>
                    <TableHead className="text-right">Visit.</TableHead>
                    <TableHead className="text-right">Presença (8 sem.)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rede.map((r) => (
                    <TableRow key={r.churchId}>
                      <TableCell className="font-medium">{r.churchName}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.classes}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.matriculados}</TableCell>
                      <TableCell>{r.ultimoDomingo ? formatarData(r.ultimoDomingo) : "sem chamada"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.presentesUltimo}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.visitantesUltimo}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarPercentual(r.presenca8Semanas)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="flex flex-col gap-2 md:hidden">
              {rede.map((r) => (
                <li key={r.churchId} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{r.churchName}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {r.classes} classes · {r.matriculados} alunos · presença {formatarPercentual(r.presenca8Semanas)}
                    {r.ultimoDomingo ? ` · ${formatarData(r.ultimoDomingo)}: ${r.presentesUltimo} presentes` : " · sem chamada"}
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

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string | number; detalhe?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor}</p>
      {detalhe ? <p className="text-[0.7rem] text-muted-foreground">{detalhe}</p> : null}
    </div>
  );
}
