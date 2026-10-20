import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NaoMembroBadge } from "@/features/ebd/components/ebd-classe-acoes";
import { EbdChamadasDoAluno } from "@/features/ebd/components/ebd-chamadas-do-aluno";
import { EditarAlunoEbd } from "@/features/ebd/components/ebd-editar-aluno";
import { formatarData, hojeISO } from "@/lib/acompanhamento";
import { idadeEm } from "@/lib/ebd";
import { isAppError } from "@/lib/errors";
import { mascaraTelefone } from "@/lib/telefone";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";

export const metadata: Metadata = { title: "Aluno da EBD" };

/**
 * Página do aluno na EBD: dados, resumo e as chamadas (com período, filtro e páginas). Quem
 * vê é quem enxerga a classe dele (gestão da EBD ou o professor); o banco
 * decide e devolve só as aulas dessas classes.
 */
export default async function EbdAlunoPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getEbdActorAutorizado();
  if (!actor) notFound();
  const { id } = await params;
  const service = await getEbdService();
  const [aluno, trimestres] = await Promise.all([
    service.historicoDoAluno(actor, id).catch((err: unknown) => {
      if (isAppError(err) && err.code === "not_found") notFound();
      throw err;
    }),
    // Os trimestres só ajudam a escolher o período: se falharem, ficam de fora.
    service.trimestres(actor).catch(() => []),
  ]);

  const atual = aluno.matriculas.find((m) => m.ate === null);
  const anteriores = aluno.matriculas.filter((m) => m.ate !== null);
  const hoje = hojeISO();
  const idade = idadeEm(aluno.nascimento, hoje);

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
                {anteriores.length > 0
                  ? ` · antes: ${[...new Set(anteriores.map((m) => m.classeNome))].join(", ")}`
                  : ""}
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

      <EbdChamadasDoAluno aulas={aluno.aulas} trimestres={trimestres} hoje={hoje} />
    </div>
  );
}
