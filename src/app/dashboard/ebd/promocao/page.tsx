import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EbdPromocao } from "@/features/ebd/components/ebd-promocao";
import { diaDaSemana, hojeISO, somarDias } from "@/lib/acompanhamento";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import { canGerirEbd } from "@/services/ebdService";

export const metadata: Metadata = { title: "Promoção de classe" };

export default async function EbdPromocaoPage() {
  const actor = await getEbdActorAutorizado();
  if (!actor || !canGerirEbd(actor.role, actor.podeGerirEbd)) notFound();
  const hoje = hojeISO();
  // Padrão: o próximo domingo (a mudança vale a partir da próxima aula).
  const proximoDomingo = somarDias(hoje, (7 - diaDaSemana(hoje)) % 7 || 7);
  const { classes, linhas } = await (await getEbdService()).promocao(actor, proximoDomingo);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Mude os alunos de classe de uma vez (ex.: no começo do ano). A sugestão vem pela idade na data escolhida; confira
        e ajuste antes de aplicar. A classe anterior fica no histórico de cada aluno.
      </p>
      {linhas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum aluno matriculado.</p>
      ) : (
        <EbdPromocao classes={classes} linhas={linhas} dataInicial={proximoDomingo} />
      )}
    </div>
  );
}
