import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAppError } from "@/lib/errors";
import { descreverQuando, formatarData } from "@/lib/acompanhamento";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";

export const metadata: Metadata = { title: "Histórico do culto" };

export default async function HistoricoCultoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();

  const dados = await (await getAcompanhamentoService()).historicoCulto(actor, id).catch((err: unknown) => {
    if (isAppError(err) && (err.code === "not_found" || err.code === "validation_error")) return null;
    throw err;
  });
  if (!dados) notFound();
  const { culto, chamadas } = dados;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold">{culto.nome}</h3>
        <p className="text-sm text-muted-foreground">{descreverQuando(culto)} · chamadas do último ano</p>
      </div>
      {chamadas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma chamada feita ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {chamadas.map((c) => (
            <li key={c.chamadaId}>
              <Link
                href={`/dashboard/acompanhamento/chamada/${culto.id}?data=${c.data}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 hover:bg-muted"
              >
                <span className="font-medium">{formatarData(c.data)}</span>
                <span className="text-sm tabular-nums">
                  <span className="text-emerald-700 dark:text-emerald-400">{c.presentes} presentes</span> ·{" "}
                  <span className="text-amber-700 dark:text-amber-400">{c.justificados} justificados</span> ·{" "}
                  <span className="text-red-700 dark:text-red-400">{c.ausentes} ausentes</span>
                  {c.visitantes ? ` · ${c.visitantes} visitante(s)` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
