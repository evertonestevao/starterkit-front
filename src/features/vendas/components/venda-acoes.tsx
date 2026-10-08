"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Lock, LockOpen, Mail, Trash2 } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Button } from "@/components/ui/button";
import {
  definirStatusVendaAction,
  excluirVendaAction,
  reenviarConfirmacaoVendaAction,
} from "@/server/actions/vendas";
import type { Venda } from "@/types/vendas";

/** Encerrar/reabrir, reenviar o e-mail de confirmação da chave e excluir. */
export function VendaAcoes({ venda, temPedidos }: { venda: Venda; temPedidos: boolean }) {
  const [pending, start] = useTransition();

  function rodar(fn: () => Promise<{ error?: string; success?: string } | undefined>) {
    start(async () => {
      const r = await fn();
      if (r?.error) toast.error(r.error);
      else if (r?.success) toast.success(r.success);
    });
  }

  async function excluir() {
    const sim = await confirmar({
      titulo: `Excluir "${venda.titulo}"?`,
      descricao: temPedidos
        ? "A venda sai da página e da lista, junto com os pedidos dela. Se só quer parar de receber pedidos, use “Encerrar”."
        : "A venda sai da página e da lista.",
      botao: "Excluir",
      perigo: true,
    });
    if (sim) rodar(() => excluirVendaAction(venda.id));
  }

  async function encerrar() {
    const sim = await confirmar({
      titulo: "Encerrar esta venda?",
      descricao: "A página para de aceitar pedidos. Os pedidos feitos continuam aqui, e dá para reabrir depois.",
      botao: "Encerrar",
    });
    if (sim) rodar(() => definirStatusVendaAction(venda.id, "encerrada"));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {venda.pixConfirmadoEm === null ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => rodar(() => reenviarConfirmacaoVendaAction(venda.id))}
        >
          <Mail className="size-4" /> Reenviar e-mail de confirmação
        </Button>
      ) : null}
      {venda.status === "ativa" ? (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={encerrar}>
          <Lock className="size-4" /> Encerrar
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => rodar(() => definirStatusVendaAction(venda.id, "ativa"))}
        >
          <LockOpen className="size-4" /> Reabrir
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={excluir}>
        <Trash2 className="size-4" /> Excluir
      </Button>
    </div>
  );
}
