import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData, formatarPercentual, hojeISO, percentualPresenca, somarDias } from "@/lib/acompanhamento";
import { domingoSugerido, formatarReais, trimestreDe } from "@/lib/ebd";
import { FrequenciaTabela } from "@/features/acompanhamento/components/frequencia-tabela";
import { isAppError } from "@/lib/errors";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";

export const metadata: Metadata = { title: "Relatórios da EBD" };

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const selectClasses = "h-9 rounded-md border bg-transparent px-2 text-sm";

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

  const [trimestres, { classes: todasClasses }] = await Promise.all([service.trimestres(actor), service.classes(actor)]);
  // Período: trimestre escolhido > datas digitadas > trimestre do último
  // domingo (no 1º dia do trimestre novo, o atual ainda está vazio) > 13 semanas.
  const escolhido = trimestres.find((t) => t.id === sp.trimestre);
  const atual = trimestreDe(trimestres, domingoSugerido(hoje));
  const temDatas = sp.de && DATA.test(sp.de) && sp.ate && DATA.test(sp.ate);
  const de = escolhido?.inicio ?? (temDatas ? sp.de! : (atual?.inicio ?? somarDias(hoje, -90)));
  const ate = escolhido?.fim ?? (temDatas ? sp.ate! : (atual?.fim ?? hoje));
  const trimestreAtivo = escolhido ?? (!temDatas ? atual : null);

  const resultado = await service
    .relatorio(actor, { de, ate, classeId: sp.classe })
    .catch((err: unknown) => {
      if (isAppError(err) && err.code === "validation_error") return { erro: err.message };
      throw err;
    });

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-end gap-2 text-sm">
        {trimestres.length > 0 ? (
          <label className="flex flex-col gap-1">
            Trimestre
            <select name="trimestre" defaultValue={trimestreAtivo?.id ?? ""} className={selectClasses}>
              <option value="">Datas abaixo</option>
              {trimestres.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1">
          De
          <input name="de" type="date" defaultValue={de} className={selectClasses} />
        </label>
        <label className="flex flex-col gap-1">
          Até
          <input name="ate" type="date" defaultValue={ate} className={selectClasses} />
        </label>
        <label className="flex flex-col gap-1">
          Classe
          <select name="classe" defaultValue={sp.classe ?? ""} className={selectClasses}>
            <option value="">Todas</option>
            {todasClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-9 rounded-md border px-3 hover:bg-muted">
          Ver
        </button>
      </form>
      <p className="text-xs text-muted-foreground">
        {trimestreAtivo ? `${trimestreAtivo.nome} · ` : ""}
        {formatarData(de)} a {formatarData(ate)}
        {trimestreAtivo?.revista ? ` · revista: ${trimestreAtivo.revista}` : ""}
      </p>

      {"erro" in resultado ? (
        <p className="text-sm text-destructive">{resultado.erro}</p>
      ) : (
        <>
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
                                {c.aulas ? (c.presentes / c.aulas).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatarPercentual(pct)}</TableCell>
                              <TableCell className="text-right tabular-nums">{c.visitantes}</TableCell>
                              <TableCell className="text-right tabular-nums">{c.biblias}</TableCell>
                              <TableCell className="text-right tabular-nums">{c.revistas}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatarReais(c.ofertaCentavos)}</TableCell>
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
                  detalhe: [a.classeNome, !a.membroIgreja ? "não membro" : null, !a.matriculadoHoje ? "saiu da classe" : null]
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
