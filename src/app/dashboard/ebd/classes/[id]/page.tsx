import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AdicionarProfessor,
  ClasseAtivaBotao,
  ClasseForm,
  MatricularMembro,
  NaoMembroBadge,
  NovoAluno,
  RemoverProfessor,
  TirarDaClasse,
} from "@/features/ebd/components/ebd-classe-acoes";
import { ResponsaveisBotao } from "@/features/ebd/components/ebd-responsaveis";
import { formatarData, hojeISO } from "@/lib/acompanhamento";
import { domingoSugerido, formatarReais, idadeEm } from "@/lib/ebd";
import { isAppError } from "@/lib/errors";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import { canGerirEbd } from "@/services/ebdService";

export const metadata: Metadata = { title: "Classe da EBD" };

export default async function ClasseEbdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getEbdActorAutorizado();
  if (!actor) notFound();
  const gestao = canGerirEbd(actor.role, actor.podeGerirEbd);

  const service = await getEbdService();
  const dados = await service.classe(actor, id).catch((err: unknown) => {
    if (isAppError(err) && (err.code === "not_found" || err.code === "validation_error")) return null;
    throw err;
  });
  if (!dados) notFound();
  const { classe, alunos, aulas, visitantes } = dados;
  const responsaveis = await service.responsaveis(alunos.map((a) => a.membroId));
  const hoje = hojeISO();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/ebd" className="text-xs text-muted-foreground hover:underline">
            ← EBD
          </Link>
          <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {classe.nome}
            {!classe.ativa ? <Badge variant="outline">Encerrada</Badge> : null}
          </h3>
          <p className="text-sm text-muted-foreground">{[classe.faixaEtaria, classe.sala].filter(Boolean).join(" · ") || "—"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {classe.ativa ? (
            <Link href={`/dashboard/ebd/classes/${classe.id}/chamada?data=${domingoSugerido(hoje)}`} className={buttonVariants()}>
              <ClipboardCheck className="size-4" /> Fazer chamada
            </Link>
          ) : null}
          {gestao ? (
            <>
              <ClasseForm classe={classe} />
              <ClasseAtivaBotao classe={classe} />
            </>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Alunos ({alunos.length})</CardTitle>
              <CardDescription>Matriculados hoje nesta classe.</CardDescription>
            </div>
            {classe.ativa ? (
              <div className="flex flex-wrap gap-2">
                {gestao ? <MatricularMembro classe={classe} /> : null}
                <NovoAluno classeId={classe.id} />
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {alunos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém matriculado ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {alunos.map((a) => {
                const idade = idadeEm(a.nascimento, hoje);
                return (
                  <li key={a.matriculaId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5 font-medium">
                        {a.nome} {!a.membroIgreja ? <NaoMembroBadge /> : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {[idade !== null ? `${idade} anos` : null, a.whatsapp, `desde ${formatarData(a.desde)}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      <ResponsaveisBotao
                        membro={{ id: a.membroId, nome: a.nome }}
                        responsaveis={responsaveis[a.membroId] ?? []}
                        cuidados={a.cuidados}
                        podeEscolherMembro={gestao}
                      />
                      <TirarDaClasse matriculaId={a.matriculaId} nome={a.nome} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <CardTitle className="text-base">Professores</CardTitle>
              {gestao ? <AdicionarProfessor classe={classe} /> : null}
            </div>
          </CardHeader>
          <CardContent>
            {classe.professores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum professor definido.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {classe.professores.map((p) => (
                  <li key={p.membroId} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      {p.nome}
                      {p.temLogin ? (
                        <KeyRound className="size-3.5 text-muted-foreground" aria-label="tem acesso ao sistema" />
                      ) : (
                        <span className="text-xs text-muted-foreground">(sem acesso ao sistema)</span>
                      )}
                    </span>
                    {gestao ? <RemoverProfessor classeId={classe.id} membroId={p.membroId} nome={p.nome} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visitantes que podem virar alunos</CardTitle>
            <CardDescription>Registrados nas últimas chamadas e ainda não matriculados.</CardDescription>
          </CardHeader>
          <CardContent>
            {visitantes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum.</p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {visitantes.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0">
                      <span className="block truncate">{v.nome}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatarData(v.data)}
                        {v.telefone ? ` · ${v.telefone}` : ""}
                      </span>
                    </span>
                    {classe.ativa ? <NovoAluno classeId={classe.id} visitante={v} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aulas</CardTitle>
        </CardHeader>
        <CardContent>
          {aulas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma chamada feita ainda.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {aulas.map((a) => (
                <li key={a.aulaId}>
                  <Link
                    href={`/dashboard/ebd/classes/${classe.id}/chamada?data=${a.data}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 hover:bg-muted/50"
                  >
                    <span>
                      <span className="font-medium">{formatarData(a.data)}</span>
                      {a.licao ? <span className="text-muted-foreground"> · {a.licao}</span> : null}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {a.presentes} P · {a.ausentes} A · {a.justificados} J · {a.visitantes} visit. · {formatarReais(a.ofertaCentavos)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
