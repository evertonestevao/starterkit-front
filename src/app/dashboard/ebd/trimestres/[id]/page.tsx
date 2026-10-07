import type { Metadata } from "next";
import { BotaoVoltar } from "@/components/botao-voltar";
import { notFound } from "next/navigation";
import { EbdLicoes } from "@/features/ebd/components/ebd-licoes";
import { formatarData } from "@/lib/acompanhamento";
import { isAppError } from "@/lib/errors";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import { canGerirEbd } from "@/services/ebdService";

export const metadata: Metadata = { title: "Lições do trimestre" };

export default async function EbdLicoesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ classe?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const actor = await getEbdActorAutorizado();
  if (!actor) notFound();
  const service = await getEbdService();
  const [dados, { classes }] = await Promise.all([
    service.licoes(actor, id, sp.classe || null).catch((err: unknown) => {
      if (isAppError(err) && (err.code === "not_found" || err.code === "validation_error")) return null;
      throw err;
    }),
    service.classes(actor),
  ]);
  if (!dados) notFound();
  const ativas = classes.filter((c) => c.ativa);
  const gestao = canGerirEbd(actor.role, actor.podeGerirEbd);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <BotaoVoltar href={gestao ? "/dashboard/ebd/trimestres" : "/dashboard/ebd"} />
        <h3 className="text-lg font-semibold">Lições — {dados.trimestre.nome}</h3>
        <p className="text-sm text-muted-foreground">
          {formatarData(dados.trimestre.inicio)} a {formatarData(dados.trimestre.fim)}
          {dados.trimestre.revista ? ` · ${dados.trimestre.revista}` : ""}. A chamada de cada domingo já vem com a lição
          do dia.
        </p>
      </div>
      {ativas.length > 0 ? (
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            Títulos de
            <select name="classe" defaultValue={dados.classe?.id ?? ""} className="h-9 rounded-md border bg-transparent px-2">
              <option value="">Geral (todas as classes)</option>
              {ativas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-9 rounded-md border px-3 hover:bg-muted">
            Ver
          </button>
          <span className="text-xs text-muted-foreground">
            {dados.classe
              ? `Títulos da revista de ${dados.classe.nome}. Em branco, a classe usa o título geral.`
              : "Cada classe pode ter os títulos da própria revista."}
          </span>
        </form>
      ) : null}
      <EbdLicoes trimestreId={id} licoes={dados.licoes} gestao={gestao} classeId={dados.classe?.id ?? null} />
    </div>
  );
}
