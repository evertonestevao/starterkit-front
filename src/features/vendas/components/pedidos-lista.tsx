"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, MessageCircle, RotateCcw, X } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { linkWhatsapp } from "@/lib/acompanhamento";
import { STATUS_PEDIDO, descreverItens } from "@/lib/vendas";
import { marcarPedidoVendaAction } from "@/server/actions/vendas";
import { formatCents } from "@/services/sponsorPricing";
import type { PedidoVenda, StatusPedido } from "@/types/vendas";

const VARIANTE: Record<StatusPedido, "default" | "secondary" | "outline"> = {
  pendente: "outline",
  pago: "default",
  cancelado: "secondary",
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * Pedidos de uma venda. Quem cuida confere o comprovante (no WhatsApp ou no
 * extrato) e marca como pago. Uma linha por pedido, que quebra em cartão no celular.
 */
export function PedidosLista({
  pedidos,
  titulo,
  temOpcoes,
}: {
  pedidos: PedidoVenda[];
  titulo: string;
  temOpcoes: boolean;
}) {
  const [pending, start] = useTransition();

  function marcar(p: PedidoVenda, status: StatusPedido) {
    start(async () => {
      const r = await marcarPedidoVendaAction(p.id, status);
      if (r.error) toast.error(r.error);
      else toast.success(r.success ?? "Pedido atualizado.");
    });
  }

  async function cancelar(p: PedidoVenda) {
    const sim = await confirmar({
      titulo: `Cancelar o pedido de ${p.nome}?`,
      descricao: "As unidades voltam para o estoque. Dá para desfazer depois.",
      botao: "Cancelar pedido",
      perigo: true,
    });
    if (sim) marcar(p, "cancelado");
  }

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {pedidos.map((p) => {
        // "2 Carne, 1 Queijo" com opções; "3 × R$ 55,00" sem.
        const oQue = temOpcoes
          ? descreverItens(p.itens)
          : `${p.quantidade} × ${formatCents(p.itens[0]?.precoUnitarioCents ?? p.totalCents / Math.max(p.quantidade, 1))}`;
        const whats = linkWhatsapp(
          p.telefone,
          `Olá, ${p.nome.split(" ")[0]}! Sobre o seu pedido de ${titulo} (${oQue} = ${formatCents(p.totalCents)}):`,
        );
        return (
          <li
            key={p.id}
            className={`flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${
              p.status === "cancelado" ? "opacity-60" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 font-medium">
                {p.nome}
                <Badge variant={VARIANTE[p.status]}>{STATUS_PEDIDO[p.status]}</Badge>
              </p>
              {temOpcoes ? <p className="text-sm">{oQue}</p> : null}
              <p className="text-xs text-muted-foreground">
                {temOpcoes ? `${p.quantidade} un.` : oQue} · {dataHora.format(new Date(p.createdAt))} · {p.telefone}
              </p>
              {p.observacao ? (
                <p className="mt-1 rounded-md bg-muted px-2 py-1 text-xs whitespace-pre-line">{p.observacao}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 font-semibold tabular-nums">{formatCents(p.totalCents)}</span>
              {whats ? (
                <a
                  href={whats}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`WhatsApp de ${p.nome}`}
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <MessageCircle className="size-4" />
                </a>
              ) : null}
              {p.status === "pendente" ? (
                <>
                  <Button type="button" size="sm" disabled={pending} onClick={() => marcar(p, "pago")}>
                    <Check className="size-4" /> Pago
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => cancelar(p)}>
                    <X className="size-4" /> Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => marcar(p, "pendente")}
                  aria-label={`Voltar o pedido de ${p.nome} para aguardando pagamento`}
                >
                  <RotateCcw className="size-4" /> Desfazer
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
