import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JustificativaForm, JustificativasLista } from "@/features/acompanhamento/components/justificativas";
import { hojeISO } from "@/lib/acompanhamento";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";

export const metadata: Metadata = { title: "Justificativas" };

export default async function JustificativasPage() {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();
  const service = await getAcompanhamentoService();
  const [justificativas, membros] = await Promise.all([
    service.listJustificativasAtivas(actor),
    service.listMembros(actor),
  ]);
  const ativos = membros.filter((m) => m.ativo).map((m) => ({ id: m.id, nome: m.nome }));
  const hoje = hojeISO();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Quem avisou que não vai. Durante o período, a pessoa aparece como Justificado na chamada e não entra em alerta.
        </p>
        <JustificativaForm membros={ativos} hoje={hoje} />
      </div>
      <JustificativasLista justificativas={justificativas} membros={ativos} hoje={hoje} />
    </div>
  );
}
