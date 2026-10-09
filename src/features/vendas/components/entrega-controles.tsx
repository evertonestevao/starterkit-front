"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PackageCheck, RotateCcw } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { marcarEntregaVendaAction } from "@/server/actions/vendas";
import type { PedidoVenda } from "@/types/vendas";

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * Entrega do pedido inteiro, com observação ("falta 1 GG"). Pedido ainda não
 * pago pede uma confirmação a mais e marca pago junto. Já entregue: mostra
 * quando (e por quem, se vier) em destaque — pega voucher repassado.
 */
export function EntregaControles({
  pedido,
  entreguePor = null,
  compacto = false,
}: {
  pedido: Pick<PedidoVenda, "id" | "nome" | "status" | "entregueEm" | "entregaObs">;
  entreguePor?: string | null;
  /** Na lista de pedidos: só o botão, sem o campo de observação. */
  compacto?: boolean;
}) {
  const [pending, start] = useTransition();
  const [obs, setObs] = useState("");

  function rodar(input: { entregue: boolean; obs?: string | null; tambemPago?: boolean }) {
    start(async () => {
      const r = await marcarEntregaVendaAction(pedido.id, input);
      if (r.error) toast.error(r.error);
      else toast.success(r.success ?? "Pronto.");
    });
  }

  async function entregar() {
    if (pedido.status === "pendente") {
      const sim = await confirmar({
        titulo: "Pagamento ainda não confirmado",
        descricao: `O pedido de ${pedido.nome} está como "aguardando pagamento". Se você conferiu o comprovante agora, confirme: ele fica pago e entregue.`,
        botao: "Marcar pago e entregue",
      });
      if (!sim) return;
      rodar({ entregue: true, obs, tambemPago: true });
      return;
    }
    rodar({ entregue: true, obs });
  }

  async function desfazer() {
    const sim = await confirmar({
      titulo: "Desfazer a entrega?",
      descricao: "O pedido volta a aparecer como não retirado.",
      botao: "Desfazer",
    });
    if (sim) rodar({ entregue: false });
  }

  if (pedido.entregueEm) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="rounded-md bg-amber-100 px-2 py-1 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Já entregue em {dataHora.format(new Date(pedido.entregueEm))}
          {entreguePor ? ` por ${entreguePor}` : ""}
        </p>
        {pedido.entregaObs ? <p className="text-xs text-muted-foreground">Obs.: {pedido.entregaObs}</p> : null}
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={desfazer} className="self-start">
          <RotateCcw className="size-4" /> Desfazer entrega
        </Button>
      </div>
    );
  }

  if (pedido.status === "cancelado") {
    return <p className="text-sm text-muted-foreground">Pedido cancelado: não há o que entregar.</p>;
  }

  if (compacto) {
    return (
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={entregar}>
        <PackageCheck className="size-4" /> Entregue
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        maxLength={300}
        placeholder="Observação da entrega (opcional): falta 1 GG..."
        aria-label="Observação da entrega"
      />
      <Button type="button" size="lg" disabled={pending} onClick={entregar} className="w-full sm:w-auto">
        <PackageCheck className="size-5" /> Marcar como entregue
      </Button>
    </div>
  );
}
