import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JustificativasLongasLista } from "@/features/acompanhamento/components/alertas-lista";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";

export const metadata: Metadata = { title: "Justificativas longas" };

export default async function JustificativasLongasPage() {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();
  const { igreja, longas } = await (await getAcompanhamentoService()).justificativasLongas(actor);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Quem está justificando há muito tempo. Não é falta — mas vale uma palavra de carinho para ninguém se afastar sem
        ser notado.
      </p>
      <JustificativasLongasLista longas={longas} igreja={igreja.name} />
    </div>
  );
}
