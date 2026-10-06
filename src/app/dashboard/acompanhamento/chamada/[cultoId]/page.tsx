import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BotaoVoltar } from "@/components/botao-voltar";
import { Badge } from "@/components/ui/badge";
import { ChamadaForm } from "@/features/acompanhamento/components/chamada-form";
import { isAppError } from "@/lib/errors";
import { descreverQuando, formatarData, hojeISO, somarDias, ultimaOcorrencia } from "@/lib/acompanhamento";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";

export const metadata: Metadata = { title: "Chamada" };

export default async function ChamadaPage({
  params,
  searchParams,
}: {
  params: Promise<{ cultoId: string }>;
  searchParams: Promise<{ data?: string }>;
}) {
  const [{ cultoId }, { data }] = await Promise.all([params, searchParams]);
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();
  const service = await getAcompanhamentoService();
  const hoje = hojeISO();

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    const culto = (await service.listCultos(actor)).find((c) => c.id === cultoId);
    const sugerida = culto ? ultimaOcorrencia(culto, hoje) : null;
    if (!culto || !sugerida) notFound();
    redirect(`/dashboard/acompanhamento/chamada/${cultoId}?data=${sugerida}`);
  }

  // Data que não é dia do culto (ou culto sem chamada) vira aviso na tela,
  // com o seletor de data à mão — não um 404.
  const { chamada, aviso } = await service
    .abrirChamada(actor, cultoId, data)
    .then((c) => ({ chamada: c, aviso: null as string | null }))
    .catch((err: unknown) => {
      if (isAppError(err) && err.code === "validation_error") return { chamada: null, aviso: err.message };
      if (isAppError(err) && err.code === "not_found") return { chamada: null, aviso: null };
      throw err;
    });
  if (!chamada && !aviso) notFound();

  return (
    <div className="flex flex-col gap-4">
      <BotaoVoltar href="/dashboard/acompanhamento/chamada" />
      <div className="flex flex-col gap-2">
        {chamada ? (
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{chamada.culto.nome}</h3>
            {chamada.chamadaId ? (
              <Badge variant="secondary">Chamada já feita — editando</Badge>
            ) : (
              <Badge>Nova chamada</Badge>
            )}
            <span className="w-full text-sm text-muted-foreground">{descreverQuando(chamada.culto)}</span>
          </div>
        ) : null}
        {/* Formulário GET: trocar a data recarrega a página com a chamada daquele dia. */}
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="data" className="text-muted-foreground">
            Data do culto:
          </label>
          <input
            id="data"
            name="data"
            type="date"
            defaultValue={data}
            max={somarDias(hoje, 1)}
            className="h-9 rounded-md border bg-transparent px-2"
          />
          <button type="submit" className="h-9 rounded-md border px-3 hover:bg-muted">
            Abrir
          </button>
          <span className="text-muted-foreground">({formatarData(data)})</span>
        </form>
      </div>
      {aviso ? (
        <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">{aviso}</p>
      ) : null}
      {chamada ? (
        // key: trocar a data remonta a tela com o estado daquela chamada.
        <ChamadaForm key={`${cultoId}-${data}-${chamada.chamadaId ?? "nova"}`} chamada={chamada} />
      ) : null}
    </div>
  );
}
