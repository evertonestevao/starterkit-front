import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FrequenciaTabela } from "@/features/acompanhamento/components/frequencia-tabela";
import { isAppError } from "@/lib/errors";
import {
  formatarData,
  hojeISO,
  somarDias,
} from "@/lib/acompanhamento";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";

export const metadata: Metadata = { title: "Relatórios de presença" };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();
  const sp = await searchParams;
  const hoje = hojeISO();
  const ate = sp.ate && DATA.test(sp.ate) ? sp.ate : hoje;
  const de = sp.de && DATA.test(sp.de) ? sp.de : somarDias(ate, -56);

  const resultado = await (await getAcompanhamentoService())
    .relatorio(actor, { de, ate })
    .catch((err: unknown) => {
      if (isAppError(err) && err.code === "validation_error") return { erro: err.message };
      throw err;
    });

  const totais =
    "chamadas" in resultado
      ? resultado.chamadas.reduce(
          (t, c) => ({ p: t.p + c.presentes, j: t.j + c.justificados, a: t.a + c.ausentes, v: t.v + c.visitantes }),
          { p: 0, j: 0, a: 0, v: 0 },
        )
      : null;

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          De
          <input name="de" type="date" defaultValue={de} className="h-9 rounded-md border bg-transparent px-2" />
        </label>
        <label className="flex flex-col gap-1">
          Até
          <input name="ate" type="date" defaultValue={ate} className="h-9 rounded-md border bg-transparent px-2" />
        </label>
        <button type="submit" className="h-9 rounded-md border px-3 hover:bg-muted">
          Ver período
        </button>
      </form>

      {"erro" in resultado ? (
        <p className="text-sm text-destructive">{resultado.erro}</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Presença por culto</CardTitle>
              <CardDescription>
                {formatarData(de)} a {formatarData(ate)} · no período: {totais?.p} presenças, {totais?.j} justificadas,{" "}
                {totais?.a} ausências, {totais?.v} visitantes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resultado.chamadas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma chamada no período.</p>
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Culto</TableHead>
                          <TableHead className="text-right">Presentes</TableHead>
                          <TableHead className="text-right">Justificados</TableHead>
                          <TableHead className="text-right">Ausentes</TableHead>
                          <TableHead className="text-right">Visitantes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resultado.chamadas.map((c) => (
                          <TableRow key={c.chamadaId}>
                            <TableCell>
                              <Link href={`/dashboard/acompanhamento/chamada/${c.cultoId}?data=${c.data}`} className="hover:underline">
                                {formatarData(c.data)}
                              </Link>
                            </TableCell>
                            <TableCell>{c.cultoNome}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.presentes}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.justificados}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.ausentes}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.visitantes}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <ul className="flex flex-col gap-2 md:hidden">
                    {resultado.chamadas.map((c) => (
                      <li key={c.chamadaId} className="rounded-lg border p-3 text-sm">
                        <p className="font-medium">
                          {formatarData(c.data)} · {c.cultoNome}
                        </p>
                        <p className="tabular-nums">
                          {c.presentes} presentes · {c.justificados} justificados · {c.ausentes} ausentes
                          {c.visitantes ? ` · ${c.visitantes} visit.` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Frequência por membro</CardTitle>
              <CardDescription>A porcentagem considera só os cultos sem justificativa.</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Só quem teve culto no período: quem não participa da chamada não entra. */}
              <FrequenciaTabela
                vazio="Nenhuma presença registrada no período."
                linhas={resultado.frequencia
                  .filter((f) => f.presentes + f.ausentes + f.justificados > 0)
                  .map((f) => ({
                    key: f.membroId,
                    nome: f.nome,
                    href: `/dashboard/membros/${f.membroId}`,
                    detalhe: f.ativo ? undefined : "inativo",
                    presentes: f.presentes,
                    justificados: f.justificados,
                    ausentes: f.ausentes,
                    percentual: f.percentual,
                  }))}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
