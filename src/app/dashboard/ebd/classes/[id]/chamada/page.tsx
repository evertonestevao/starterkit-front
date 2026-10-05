import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DataAuto } from "@/components/data-auto";
import { Badge } from "@/components/ui/badge";
import { EbdChamadaForm } from "@/features/ebd/components/ebd-chamada-form";
import { formatarData, hojeISO, somarDias } from "@/lib/acompanhamento";
import { domingoSugerido } from "@/lib/ebd";
import { isAppError } from "@/lib/errors";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";

export const metadata: Metadata = { title: "Chamada da EBD" };

export default async function ChamadaEbdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ data?: string }>;
}) {
  const [{ id }, { data }] = await Promise.all([params, searchParams]);
  const actor = await getEbdActorAutorizado();
  if (!actor) notFound();
  const hoje = hojeISO();
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    redirect(`/dashboard/ebd/classes/${id}/chamada?data=${domingoSugerido(hoje)}`);
  }

  const { aula, aviso } = await (await getEbdService())
    .abrirAula(actor, id, data)
    .then((a) => ({ aula: a, aviso: null as string | null }))
    .catch((err: unknown) => {
      if (isAppError(err) && err.code === "validation_error") return { aula: null, aviso: err.message };
      if (isAppError(err) && err.code === "not_found") return { aula: null, aviso: null };
      throw err;
    });
  if (!aula && !aviso) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Link href={`/dashboard/ebd/classes/${id}`} className="text-xs text-muted-foreground hover:underline">
          ← {aula?.classe.nome ?? "Classe"}
        </Link>
        {aula ? (
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">Chamada — {aula.classe.nome}</h3>
            {aula.aulaId ? <Badge variant="secondary">Já feita — editando</Badge> : <Badge>Nova chamada</Badge>}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Domingo:</span>
          <DataAuto valor={data} rotulo="Domingo da chamada" max={somarDias(hoje, 1)} />
          <span className="text-muted-foreground">({formatarData(data)})</span>
        </div>
      </div>
      {aviso ? <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">{aviso}</p> : null}
      {aula ? <EbdChamadaForm key={`${id}-${data}-${aula.aulaId ?? "nova"}`} aula={aula} /> : null}
    </div>
  );
}
