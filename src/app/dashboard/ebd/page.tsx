import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ClipboardCheck, FileDown, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClasseForm } from "@/features/ebd/components/ebd-classe-acoes";
import { formatarData, formatarPercentual, hojeISO } from "@/lib/acompanhamento";
import { domingoSugerido, formatarReais, totaisDoDia, trimestreDe } from "@/lib/ebd";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";

export const metadata: Metadata = { title: "EBD" };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export default async function EbdPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const actor = await getEbdActorAutorizado();
  if (!actor) notFound();
  const sp = await searchParams;
  const data = sp.data && DATA.test(sp.data) ? sp.data : domingoSugerido(hojeISO());

  const service = await getEbdService();
  const [{ classes, gestao }, resumo, trimestres, rede] = await Promise.all([
    service.classes(actor),
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
  const ativas = classes.filter((c) => c.ativa);
  const encerradas = classes.filter((c) => !c.ativa);

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
              <form className="flex items-center gap-2 text-sm">
                <input name="data" type="date" defaultValue={data} className="h-9 rounded-md border bg-transparent px-2" aria-label="Domingo" />
                <button type="submit" className="h-9 rounded-md border px-3 hover:bg-muted">
                  Ver
                </button>
              </form>
              <Link href={`/dashboard/ebd/relatorio?data=${data}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <FileDown className="size-4" /> Gerar PDF
              </Link>
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
            <p className="text-sm text-muted-foreground">Nenhuma classe ativa.</p>
          ) : (
            <>
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
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            chamada não feita
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <Link
                            href={`/dashboard/ebd/classes/${r.classeId}/chamada?data=${data}`}
                            className={buttonVariants({ size: "sm", variant: r.chamadaFeita ? "outline" : "default" })}
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
                          : `${r.matriculados} matriculados · chamada não feita`}
                      </p>
                    </Link>
                    <Link
                      href={`/dashboard/ebd/classes/${r.classeId}/chamada?data=${data}`}
                      className={buttonVariants({ size: "sm", variant: r.chamadaFeita ? "outline" : "default" })}
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

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-medium">
            <BookOpen className="size-4 text-primary" /> {gestao ? "Classes" : "Suas classes"}
          </h3>
          {gestao ? <ClasseForm /> : null}
        </div>
        {ativas.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {gestao ? "Nenhuma classe ainda. Crie a primeira (ex.: Adultos, Jovens, Juniores)." : "Você ainda não tem classe."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {ativas.map((c) => (
              <Link key={c.id} href={`/dashboard/ebd/classes/${c.id}`} className="rounded-lg border p-3 transition-colors hover:bg-muted">
                <p className="font-medium">{c.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {[c.faixaEtaria, c.sala].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="mt-2 flex items-center gap-1 text-sm">
                  <Users className="size-3.5 text-muted-foreground" /> {c.matriculados} aluno(s)
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.professores.length > 0 ? `Prof.: ${c.professores.map((p) => p.nome).join(", ")}` : "Sem professor definido"}
                </p>
              </Link>
            ))}
          </div>
        )}
        {gestao && encerradas.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Encerradas:{" "}
            {encerradas.map((c, i) => (
              <span key={c.id}>
                {i > 0 ? ", " : ""}
                <Link href={`/dashboard/ebd/classes/${c.id}`} className="underline-offset-4 hover:underline">
                  {c.nome}
                </Link>
              </span>
            ))}{" "}
            <Badge variant="outline">histórico</Badge>
          </p>
        ) : null}
      </section>

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
