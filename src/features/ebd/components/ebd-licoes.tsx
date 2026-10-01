"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarData } from "@/lib/acompanhamento";
import { gerarLicoesAction, salvarTituloLicaoAction } from "@/server/actions/ebd";
import type { EbdLicao } from "@/types/ebd";

/** Lições do trimestre: uma por domingo; a gestão escreve os títulos. */
export function EbdLicoes({
  trimestreId,
  licoes,
  gestao,
  classeId = null,
}: {
  trimestreId: string;
  licoes: EbdLicao[];
  gestao: boolean;
  /** Editando os títulos da revista de uma classe (null = título geral). */
  classeId?: string | null;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {gestao && !classeId ? (
        <Button
          type="button"
          variant={licoes.length === 0 ? "default" : "outline"}
          className="self-start"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await gerarLicoesAction(trimestreId);
              if (r.error) toast.error(r.error);
              else toast.success(r.success ?? "Pronto.");
            })
          }
        >
          <ListPlus className="size-4" /> {licoes.length === 0 ? "Criar as lições (uma por domingo)" : "Completar lições que faltam"}
        </Button>
      ) : null}
      {licoes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma lição ainda.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {licoes.map((l) => (
            <LinhaLicao key={`${l.id}-${classeId ?? "geral"}`} licao={l} gestao={gestao} classeId={classeId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinhaLicao({ licao, gestao, classeId }: { licao: EbdLicao; gestao: boolean; classeId: string | null }) {
  const [titulo, setTitulo] = useState(licao.titulo ?? "");
  const [pending, start] = useTransition();
  const mudou = titulo !== (licao.titulo ?? "");
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <span className="w-28 shrink-0 font-medium tabular-nums">
        Lição {licao.numero}
        <span className="block text-xs font-normal text-muted-foreground">{formatarData(licao.data)}</span>
      </span>
      {gestao ? (
        <>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={160}
            placeholder={
              classeId ? (licao.tituloGeral ? `Geral: ${licao.tituloGeral}` : "Título nesta revista") : "Título da lição (opcional)"
            }
            className="min-w-48 flex-1"
            aria-label={`Título da lição ${licao.numero}`}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !mudou}
            onClick={() =>
              start(async () => {
                const r = await salvarTituloLicaoAction(licao.id, titulo, classeId);
                if (r.error) toast.error(r.error);
                else toast.success(r.success ?? "Salvo.");
              })
            }
          >
            Salvar
          </Button>
        </>
      ) : (
        <span className="flex-1">
          {licao.titulo ?? licao.tituloGeral ?? <span className="text-muted-foreground">sem título</span>}
        </span>
      )}
    </li>
  );
}
