import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RegrasForm } from "@/features/acompanhamento/components/regras-form";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";
import { canConfigurar } from "@/services/acompanhamentoService";

export const metadata: Metadata = { title: "Regras do alerta" };

export default async function RegrasPage() {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor || !canConfigurar(actor.role)) notFound();
  const config = await (await getAcompanhamentoService()).getConfig(actor);

  return <RegrasForm config={config} />;
}
