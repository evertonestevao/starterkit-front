import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSaudacaoAtiva } from "@/server/saudacao";
import { PaginationControls } from "@/components/pagination-controls";
import { AlertasLista } from "@/features/acompanhamento/components/alertas-lista";
import { paginaDaUrl, paginar } from "@/lib/paginacao";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";

export const metadata: Metadata = { title: "Membros em alerta" };

/** Membros em alerta por página. */
const POR_PAGINA = 20;

export default async function AlertasPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();
  const { igreja, alertas } = await (await getAcompanhamentoService()).alertas(actor);
  const pag = paginar(alertas, paginaDaUrl((await searchParams).page), POR_PAGINA);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Quem faltou vários cultos seguidos sem avisar. Uma mensagem ou ligação faz diferença — depois, registre o
        contato.
      </p>
      <AlertasLista alertas={pag.itens} igreja={igreja.name} saudacao={await getSaudacaoAtiva()} />
      <PaginationControls
        page={pag.pagina}
        pageSize={POR_PAGINA}
        total={pag.total}
        basePath="/dashboard/acompanhamento/alertas"
      />
    </div>
  );
}
