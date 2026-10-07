import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CultosLista } from "@/features/acompanhamento/components/cultos-lista";
import { hojeISO } from "@/lib/acompanhamento";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";

export const metadata: Metadata = { title: "Cultos" };

export default async function CultosPage() {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();
  const cultos = await (await getAcompanhamentoService()).listCultos(actor);
  // Programação é editada por owner/admin; o member autorizado só faz a chamada.
  const editaProgramacao = actor.role === "owner" || actor.role === "admin";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Os cultos vêm da Programação da igreja. Toque em &ldquo;Chamada&rdquo; para marcar a presença.
        </p>
        {editaProgramacao ? (
          <Link href="/dashboard/programacao" className={buttonVariants({ variant: "outline" })}>
            <CalendarClock className="size-4" /> Editar programação
          </Link>
        ) : null}
      </div>
      <CultosLista cultos={cultos} hoje={hojeISO()} />
    </div>
  );
}
