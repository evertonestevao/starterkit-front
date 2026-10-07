import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EbdAlunosLista } from "@/features/ebd/components/ebd-alunos-lista";
import { hojeISO } from "@/lib/acompanhamento";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";

export const metadata: Metadata = { title: "Alunos da EBD" };

/**
 * Todos os alunos da EBD: quem está matriculado hoje, em qual classe. A
 * gestão vê a escola inteira; o professor, as classes dele. A matrícula
 * continua sendo feita na página de cada classe.
 */
export default async function EbdAlunosPage() {
  const actor = await getEbdActorAutorizado();
  if (!actor) notFound();

  const service = await getEbdService();
  const { alunos, classes, gestao } = await service.alunosDaIgreja(actor);
  // Os responsáveis são um complemento: se falharem, a lista segue sem eles.
  const responsaveis = await service.responsaveis(alunos.map((a) => a.membroId)).catch((err: unknown) => {
    console.error("[ebd] falha ao carregar os responsáveis", err);
    return {};
  });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-lg font-semibold">Alunos</h3>
        <p className="text-sm text-muted-foreground">
          {gestao
            ? "Quem está matriculado hoje na Escola Dominical, em todas as classes."
            : "Quem está matriculado hoje nas suas classes."}{" "}
          Para matricular alguém, abra a classe.
        </p>
      </div>
      <EbdAlunosLista
        alunos={alunos}
        classes={classes.map((c) => ({ id: c.id, nome: c.nome }))}
        responsaveis={responsaveis}
        gestao={gestao}
        hoje={hojeISO()}
      />
    </div>
  );
}
