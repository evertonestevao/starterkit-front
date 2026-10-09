import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuemAcessa } from "@/features/acompanhamento/components/quem-acessa";
import { getAcompanhamentoActor, getAcompanhamentoService } from "@/server/acompanhamento";

export const metadata: Metadata = { title: "Quem acessa o sistema" };

/** Só o Responsável (o service confere; cada ação confere de novo no servidor e no banco). */
export default async function QuemAcessaPage() {
  const actor = await getAcompanhamentoActor();
  if (!actor || actor.role !== "owner") notFound();
  const { pessoas, convitesSemMembro } = await (await getAcompanhamentoService()).quemAcessa(actor);
  return <QuemAcessa pessoas={pessoas} convitesSemMembro={convitesSemMembro} />;
}
