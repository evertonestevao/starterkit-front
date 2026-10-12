import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MiniBarChart } from "@/components/mini-bar-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData, formatarPercentual, hojeISO, percentualPresenca, somarDias } from "@/lib/acompanhamento";
import { domingoSugerido, formatarReais, trimestreDe, valoresDoPeriodo } from "@/lib/ebd";
import { FrequenciaTabela } from "@/features/acompanhamento/components/frequencia-tabela";
import { EbdRelatorioFiltros } from "@/features/ebd/components/ebd-relatorio-filtros";
import { isAppError } from "@/lib/errors";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";

export const metadata: Metadata = { title: "Relatórios da EBD" };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export default async function EbdRelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ trimestre?: string; de?: string; ate?: string; classe?: string }>;
}) {
  const actor = await getEbdActorAutorizado();
  if (!actor) notFound();
  const sp = await searchParams;
  const service = await getEbdService();
  const hoje = hojeISO();

  const [trimestres, { classes: todasClasses }] = await Promise.all([
    service.trimestres(actor),
    service.classes(actor),
  ]);
  // Período: as datas da URL mandam (o seletor de trimestre só as preenche).
  // Link antigo com ?trimestre= ainda vale. Sem nada: o trimestre do último
  // domingo (no 1º dia do trimestre novo, o atual ainda está vazio) ou 13 semanas.
  const escolhido = trimestres.find((t) => t.id === sp.trimestre);
  const atual = trimestreDe(trimestres, domingoSugerido(hoje));
  const temDatas = sp.de && DATA.test(sp.de) && sp.ate && DATA.test(sp.ate);
  const de = temDatas ? sp.de! : (escolhido?.inicio ?? atual?.inicio ?? somarDias(hoje, -90));
  const ate = temDatas ? sp.ate! : (escolhido?.fim ?? atual?.fim ?? hoje);
  // O trimestre "ativo" é o que casa exatamente com o período mostrado.
  const trimestreAtivo = trimestres.find((t) => t.inicio === de && t.fim === ate) ?? null;

  const classeFiltrada = todasClasses.find((c) => c.id === sp.classe)?.nome ?? null;

  const resultado = await service.relatorio(actor, { de, ate, classeId: sp.classe }).catch((err: unknown) => {
    if (isAppError(err) && err.code === "validation_error") return { erro: err.message };
    throw err;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* key: outro período na URL remonta o formulário com as datas novas. */}
      <EbdRelatorioFiltros
        key={`${de}-${ate}`}
        trimestres={trimestres}
        classes={todasClasses.map((c) => ({ id: c.id, nome: c.nome }))}
        de={de}
        ate={ate}
        classe={sp.classe ?? ""}
      />
      <p className="text-xs text-muted-foreground">
        {trimestreAtivo ? `${trimestreAtivo.nome} · ` : ""}
        {formatarData(de)} a {formatarData(ate)}
        {trimestreAtivo?.revista ? ` · revista: ${trimestreAtivo.revista}` : ""}
      </p>

      {"erro" in resultado ? (
        <p className="text-sm text-destructive">{resultado.erro}</p>
      ) : (
        <>
          <MiniBarChart
            titulo="Presença por domingo"
            descricao={`Percentual de presença em cada domingo com chamada, de ${formatarData(de)} a ${formatarData(ate)}${
              classeFiltrada ? ` · ${classeFiltrada}` : ""
            }. Justificados ficam de fora.`}
            pontos={resultado.domingos.slice(-26).map((d) => {
              const pct = percentualPresenca(d.presentes, d.ausentes);
              return {
                rotulo: formatarData(d.data).slice(0, 5),
                valor: pct,
                valorTexto: formatarPercentual(pct),
                detalhe: `${d.presentes} presentes, ${d.ausentes} ausentes, ${d.justificados} justificados, ${d.visitantes} visitante(s)`,
              };
            })}
            maximo={100}
            sufixo="%"
            vazio="Nenhuma chamada da EBD neste período."
          />

          <ValoresCard
            valores={valoresDoPeriodo(
              sp.classe ? resultado.classes.filter((k) => k.classeId === sp.classe) : resultado.classes,
              resultado.domingos.length,
            )}
            periodo={`${formatarData(de)} a ${formatarData(ate)}${classeFiltrada ? ` · ${classeFiltrada}` : ""}`}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por classe</CardTitle>
              <CardDescription>Presença conta só presentes e ausentes; justificados ficam de fora.</CardDescription>
            </CardHeader>
            <CardContent>
              {resultado.classes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma classe.</p>
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Classe</TableHead>
                          <TableHead className="text-right">Aulas</TableHead>
                          <TableHead className="text-right">Média pres.</TableHead>
                          <TableHead className="text-right">Presença</TableHead>
                          <TableHead className="text-right">Visit.</TableHead>
                          <TableHead className="text-right">Bíblias</TableHead>
                          <TableHead className="text-right">Revistas</TableHead>
                          <TableHead className="text-right">Oferta</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resultado.classes.map((c) => {
                          const pct = percentualPresenca(c.presentes, c.ausentes);
                          return (
                            <TableRow key={c.classeId}>
                              <TableCell className="font-medium">
                                <Link href={`/dashboard/ebd/classes/${c.classeId}`} className="hover:underline">
                                  {c.classeNome}
                                </Link>
                                <span className="block text-xs font-normal text-muted-foreground">
                                  {c.matriculadosHoje} matriculado(s) hoje
                                </span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{c.aulas}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {c.aulas
                                  ? (c.presentes / c.aulas).toLocaleString("pt-BR", { maximumFractionDigits: 1 })
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatarPercentual(pct)}</TableCell>
                              <TableCell className="text-right tabular-nums">{c.visitantes}</TableCell>
                              <TableCell className="text-right tabular-nums">{c.biblias}</TableCell>
                              <TableCell className="text-right tabular-nums">{c.revistas}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatarReais(c.ofertaCentavos)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <ul className="flex flex-col gap-2 md:hidden">
                    {resultado.classes.map((c) => {
                      const pct = percentualPresenca(c.presentes, c.ausentes);
                      return (
                        <li key={c.classeId} className="rounded-lg border p-3 text-sm">
                          <p className="font-medium">{c.classeNome}</p>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            {c.aulas} aulas · presença {formatarPercentual(pct)} · {c.visitantes} visit. ·{" "}
                            {formatarReais(c.ofertaCentavos)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Frequência por aluno</CardTitle>
              <CardDescription>Quem esteve matriculado no período, pela classe.</CardDescription>
            </CardHeader>
            <CardContent>
              <FrequenciaTabela
                vazio="Nenhum aluno no período."
                linhas={resultado.alunos.map((a) => ({
                  key: `${a.membroId}-${a.classeId}`,
                  nome: a.nome,
                  href: `/dashboard/membros/${a.membroId}`,
                  detalhe: [
                    a.classeNome,
                    !a.membroIgreja ? "não membro" : null,
                    !a.matriculadoHoje ? "saiu da classe" : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  presentes: a.presentes,
                  justificados: a.justificados,
                  ausentes: a.ausentes,
                  percentual: a.percentual,
                }))}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/** Ofertas do período: total, média por domingo e a parte de cada classe. */
function ValoresCard({ valores, periodo }: { valores: ReturnType<typeof valoresDoPeriodo>; periodo: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Valores do período</CardTitle>
        <CardDescription>
          Ofertas registradas nas chamadas da EBD, de {periodo}. É o caixa da EBD: não entra na Tesouraria.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Oferta total</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{formatarReais(valores.totalCentavos)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Média por domingo</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {valores.mediaPorDomingoCentavos === null ? "—" : formatarReais(valores.mediaPorDomingoCentavos)}
            </p>
            <p className="text-xs text-muted-foreground">
              {valores.domingos} {valores.domingos === 1 ? "domingo" : "domingos"} com chamada
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Bíblias</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{valores.biblias}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Revistas</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{valores.revistas}</p>
          </div>
        </div>
        {valores.porClasse.length > 1 && valores.totalCentavos > 0 ? (
          <ul className="flex flex-col gap-2">
            {valores.porClasse.map((k) => (
              <li key={k.classeId} className="flex flex-col gap-1 text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">{k.classeNome}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatarReais(k.centavos)}{" "}
                    <span className="text-xs text-muted-foreground">({formatarPercentual(k.percentual)})</span>
                  </span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${k.percentual}%` }} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
