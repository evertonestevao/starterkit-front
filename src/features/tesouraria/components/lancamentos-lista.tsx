"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/acompanhamento";
import { FORMA_LABEL, TIPO_LABEL, formatarValor } from "@/lib/tesouraria";
import { excluirLancamentoAction } from "@/server/actions/tesouraria";
import type { CultoOpcao, Lancamento } from "@/types/tesouraria";
import { LancamentoDialog } from "./lancamento-dialog";

/** Os lançamentos da página atual. Uma linha por lançamento, que vira cartão no celular. */
export function LancamentosLista({
  lancamentos,
  cultos,
  hoje,
}: {
  lancamentos: Lancamento[];
  cultos: CultoOpcao[];
  hoje: string;
}) {
  const [pending, start] = useTransition();

  async function excluir(l: Lancamento) {
    const sim = await confirmar({
      titulo: "Excluir este lançamento?",
      descricao: `${TIPO_LABEL[l.tipo]} de ${formatarValor(l.valorCentavos)} em ${formatarData(l.data)}${
        l.nome ? `, de ${l.nome}` : ""
      }. A exclusão fica registrada na auditoria.`,
      botao: "Excluir",
      perigo: true,
    });
    if (!sim) return;
    start(async () => {
      const r = await excluirLancamentoAction(l.id);
      if (r.error) toast.error(r.error);
      else toast.success(r.success ?? "Lançamento excluído.");
    });
  }

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {lancamentos.map((l) => (
        <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5 font-medium">
              <Badge variant={l.tipo === "dizimo" ? "secondary" : "outline"}>{TIPO_LABEL[l.tipo]}</Badge>
              {l.tipo === "dizimo" ? (l.nome ?? <span className="text-muted-foreground">Sem nome</span>) : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {[formatarData(l.data), l.cultoTitulo, FORMA_LABEL[l.forma], l.observacao].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span className="mr-1 font-semibold tabular-nums">{formatarValor(l.valorCentavos)}</span>
            <LancamentoDialog cultos={cultos} hoje={hoje} lancamento={l} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label={`Excluir lançamento de ${l.nome ?? TIPO_LABEL[l.tipo]}`}
              onClick={() => excluir(l)}
            >
              <Trash2 className="size-4" />
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
