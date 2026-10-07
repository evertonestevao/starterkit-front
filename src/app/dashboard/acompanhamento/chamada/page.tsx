import { notFound, redirect } from "next/navigation";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";

/**
 * "Fazer chamada" sem escolher o culto: abre o sugerido pelo dia e horário
 * (culto de hoje que já começou, senão o próximo de hoje, senão o último).
 */
export default async function ChamadaSugeridaPage() {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();
  const sugestao = await (await getAcompanhamentoService()).sugestao(actor);
  if (!sugestao) redirect("/dashboard/acompanhamento/cultos");
  redirect(`/dashboard/acompanhamento/chamada/${sugestao.culto.id}?data=${sugestao.data}`);
}
