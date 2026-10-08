"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Minus, Plus } from "lucide-react";
import { CamposAntiRobo } from "@/components/campos-anti-robo";
import { TelefoneInput } from "@/components/telefone-input";
import { CopyPix } from "@/features/church/components/copy-pix";
import { campo, rotulo } from "@/features/church/components/public-actions";
import { maximoParaPedir } from "@/lib/vendas";
import { fazerPedidoVendaAction } from "@/server/actions/publicVendas";
import { formatCents } from "@/services/sponsorPricing";
import type { VendaPublica } from "@/types/vendas";

/**
 * Pedido pela página da igreja: a pessoa escolhe a quantidade (o total é
 * calculado na hora), deixa nome, WhatsApp e uma observação livre, e recebe o
 * Pix com o total já embutido. O banco confere preço, estoque e limites de novo.
 */
export function PedidoVendaForm({ venda, whatsappHref }: { venda: VendaPublica; whatsappHref: string | null }) {
  const [state, action, pending] = useActionState(fazerPedidoVendaAction, undefined);
  // O "sucesso" traz o Pix (não é uma mensagem): só o erro vira aviso.
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);
  const maximo = maximoParaPedir(venda.maxPorPedido, venda.disponivel);
  const [quantidade, setQuantidade] = useState(1);

  if (state?.success) {
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-[var(--pg-accent-soft)] p-4" role="status">
        <p className="flex items-start gap-2 text-sm leading-6 text-[var(--pg-text)]">
          <Check className="mt-0.5 size-4 shrink-0 text-[var(--pg-accent)]" aria-hidden />
          <span>
            Pedido anotado! Pague <strong>{formatCents(state.success.totalCents)}</strong> no Pix abaixo. O pagamento
            vai para <strong>{state.success.pixTitular}</strong>.
          </span>
        </p>
        <CopyPix
          chave={state.success.pixChave}
          copiaECola={state.success.pixCopiaECola}
          qrDataUrl={state.success.pixQrDataUrl}
        />
        <p className="text-sm leading-6 text-[var(--pg-muted)]">
          Depois de pagar,{" "}
          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--pg-accent)] underline underline-offset-4"
            >
              envie o comprovante pelo WhatsApp da igreja
            </a>
          ) : (
            "guarde o comprovante"
          )}
          . Quem organiza confere e confirma o seu pedido.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="relative flex flex-col gap-3">
      <CamposAntiRobo />
      <input type="hidden" name="vendaId" value={venda.id} />
      <input type="hidden" name="quantidade" value={quantidade} />

      <div className="flex flex-col gap-1.5">
        <span className={rotulo}>Quantidade</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
            disabled={quantidade <= 1}
            aria-label="Diminuir quantidade"
            className="flex size-11 items-center justify-center rounded-xl border border-[var(--pg-border)] bg-[var(--pg-surface-2)] text-[var(--pg-text)] disabled:opacity-40"
          >
            <Minus className="size-4" />
          </button>
          <span className="min-w-8 text-center text-xl font-semibold tabular-nums" aria-live="polite">
            {quantidade}
          </span>
          <button
            type="button"
            onClick={() => setQuantidade((q) => Math.min(maximo, q + 1))}
            disabled={quantidade >= maximo}
            aria-label="Aumentar quantidade"
            className="flex size-11 items-center justify-center rounded-xl border border-[var(--pg-border)] bg-[var(--pg-surface-2)] text-[var(--pg-text)] disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
          <span className="ml-auto text-right">
            <span className="block text-xs text-[var(--pg-muted)]">Total</span>
            <span className="text-xl font-bold text-[var(--pg-text)] tabular-nums">
              {formatCents(venda.precoCents * quantidade)}
            </span>
          </span>
        </div>
        {venda.maxPorPedido !== null || venda.disponivel !== null ? (
          <span className="text-xs text-[var(--pg-muted)]">
            {venda.disponivel !== null ? `Restam ${venda.disponivel}. ` : ""}
            {venda.maxPorPedido !== null ? `Até ${venda.maxPorPedido} por pedido.` : ""}
          </span>
        ) : null}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={rotulo}>Seu nome</span>
        <input name="nome" required autoComplete="name" maxLength={120} className={campo} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={rotulo}>WhatsApp</span>
        <TelefoneInput semEstilo name="telefone" required className={campo} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={rotulo}>
          Observação <span className="font-normal text-[var(--pg-muted)]">(opcional)</span>
        </span>
        <textarea
          name="observacao"
          maxLength={500}
          rows={3}
          placeholder="Ex.: 2 tamanho G e 1 M"
          className={`${campo} h-auto py-3`}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 h-12 w-full rounded-xl bg-[var(--pg-accent)] text-base font-semibold text-[var(--pg-accent-fg)] transition-opacity disabled:opacity-60"
      >
        {pending ? "Enviando..." : `Gerar Pix de ${formatCents(venda.precoCents * quantidade)}`}
      </button>
    </form>
  );
}
