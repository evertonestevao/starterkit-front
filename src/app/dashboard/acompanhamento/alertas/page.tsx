import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertasLista } from "@/features/acompanhamento/components/alertas-lista";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";

export const metadata: Metadata = { title: "Membros em alerta" };

export default async function AlertasPage() {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();
  const { igreja, alertas } = await (await getAcompanhamentoService()).alertas(actor);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Quem faltou vários cultos seguidos sem avisar. Uma mensagem ou ligação faz diferença — depois, registre o contato.
      </p>
      <AlertasLista alertas={alertas} igreja={igreja.name} />
    </div>
  );
}
