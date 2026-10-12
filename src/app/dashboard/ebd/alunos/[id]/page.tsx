import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NaoMembroBadge } from "@/features/ebd/components/ebd-classe-acoes";
import { EditarAlunoEbd } from "@/features/ebd/components/ebd-editar-aluno";
import { SeloFrequencia } from "@/features/ebd/components/selo-frequencia";
import { ESTADO_LABEL, formatarData, hojeISO } from "@/lib/acompanhamento";
import { idadeEm } from "@/lib/ebd";
import { isAppError } from "@/lib/errors";
import { mascaraTelefone } from "@/lib/telefone";
import { cn } from "@/lib/utils";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import type { EstadoPresenca } from "@/types/acompanhamento";

export const metadata: Metadata = { title: "Aluno da EBD" };

const COR_DO_ESTADO: Record<EstadoPresenca, string> = {
  presente: "border-emerald-600/30 bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  ausente: "border-red-600/30 bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200",
  justificado: "border-amber-600/30 bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
};

/**
 * Página do aluno na EBD: dados, resumo e as chamadas, uma por domingo. Quem
 * vê é quem enxerga a classe dele (gestão da EBD ou o professor); o banco
 * decide e devolve só as aulas dessas classes.
 */
export default async function EbdAlunoPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getEbdActorAutorizado();
  if (!actor) notFound();
  const { id } = await params;
  const aluno = await (await getEbdService()).historicoDoAluno(actor, id).catch((err: unknown) => {
    if (isAppError(err) && err.code === "not_found") notFound();
    throw err;
  });

  const presentes = aluno.aulas.filter((a) => a.estado === "presente").length;
  const faltas = aluno.aulas.filter((a) => a.estado === "ausente").length;
  const justificadas = aluno.aulas.filter((a) => a.estado === "justificado").length;
  const percentual = presentes + faltas > 0 ? (100 * presentes) / (presentes + faltas) : null;
  const atual = aluno.matriculas.find((m) => m.ate === null);
  const anteriores = aluno.matriculas.filter((m) => m.ate !== null);
  const idade = idadeEm(aluno.nascimento, hojeISO());

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/ebd/alunos"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Alunos
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {aluno.nome} {!aluno.membroIgreja ? <NaoMembroBadge /> : null}
              </CardTitle>
              <CardDescription className="mt-1">
                {atual ? (
                  <>
                    Classe{" "}
                    <Link
                      href={`/dashboard/ebd/classes/${atual.classeId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {atual.classeNome}
                    </Link>
                    , desde {formatarData(atual.desde)}
                  </>
                ) : (
                  "Sem matrícula ativa hoje"
                )}
                {anteriores.length > 0 ? ` · antes: ${[...new Set(anteriores.map((m) => m.classeNome))].join(", ")}` : ""}
              </CardDescription>
            </div>
            {aluno.podeEditar ? <EditarAlunoEbd aluno={aluno} /> : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Telefone</dt>
              <dd>{mascaraTelefone(aluno.whatsapp) || "Não informado"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Data de nascimento</dt>
              <dd>
                {aluno.nascimento
                  ? `${formatarData(aluno.nascimento)}${idade !== null ? ` (${idade} anos)` : ""}`
                  : "Não informada"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cadastro</dt>
              <dd>{aluno.membroIgreja ? "Membro da igreja" : "Aluno da EBD (não membro)"}</dd>
            </div>
          </dl>
          {!aluno.podeEditar ? (
            <p className="text-xs text-muted-foreground">
              {aluno.membroIgreja
                ? "Os dados de quem é membro são alterados em Membros, pela secretaria da igreja."
                : "Os dados deste aluno são alterados em Membros, pela secretaria da igreja."}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Presenças" valor={presentes} />
        <Numero rotulo="Faltas" valor={faltas} />
        <Numero rotulo="Justificadas" valor={justificadas} />
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Frequência</p>
          <p className="mt-1">
            <SeloFrequencia percentual={percentual} presentes={presentes} faltas={faltas} />
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chamadas</CardTitle>
          <CardDescription>
            Cada domingo em que o aluno estava na chamada, do mais recente para o mais antigo. Falta justificada não
            entra na frequência.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {aluno.aulas.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma chamada com este aluno ainda.
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {aluno.aulas.map((a) => (
                <li
                  key={`${a.data}-${a.classeNome}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium tabular-nums">{formatarData(a.data)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.classeNome}
                      {a.licao ? ` · ${a.licao}` : ""}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
                      COR_DO_ESTADO[a.estado],
                    )}
                  >
                    {a.estado === "ausente" ? "Faltou" : ESTADO_LABEL[a.estado]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
    </div>
  );
}
