"use client";

import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Formulario } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClasses } from "@/features/acompanhamento/components/campos";
import { useActionToast } from "@/hooks/useActionToast";
import { formatarData } from "@/lib/acompanhamento";
import { formatarReais } from "@/lib/ebd";
import { FORMA_LABEL, faltaDoPedido, pagoDoPedido, totalDoPedido } from "@/lib/ebdRevistas";
import { estornarPagamentoRevistaAction, registrarPagamentoRevistaAction } from "@/server/actions/ebdRevistas";
import type { EbdRevistaPedido } from "@/types/ebdRevistas";

/** "12,50" a partir de centavos, para o campo de valor. */
const emReais = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

/**
 * Pagamento do pedido: o que já entrou e um lançamento novo. O valor já vem
 * com o que falta; para pagar em partes, é só digitar menos.
 */
export function PagamentoForm({
  pedido,
  hoje,
  onFechar,
}: {
  pedido: EbdRevistaPedido;
  /** AAAA-MM-DD. */
  hoje: string;
  onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(registrarPagamentoRevistaAction, undefined);
  useActionToast(state);
  // Fechar o diálogo é efeito do resultado da action (sistema externo: o diálogo do pai).
  useEffect(() => {
    if (state?.success) onFechar();
  }, [state, onFechar]);
  const [desfazendo, startDesfazer] = useTransition();

  const falta = faltaDoPedido(pedido);

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg border p-2">
          <dt className="text-xs text-muted-foreground">Total</dt>
          <dd className="font-semibold tabular-nums">{formatarReais(totalDoPedido(pedido))}</dd>
        </div>
        <div className="rounded-lg border p-2">
          <dt className="text-xs text-muted-foreground">Já pago</dt>
          <dd className="font-semibold tabular-nums">{formatarReais(pagoDoPedido(pedido))}</dd>
        </div>
        <div className="rounded-lg border p-2">
          <dt className="text-xs text-muted-foreground">Falta</dt>
          <dd className="font-semibold tabular-nums">{formatarReais(falta)}</dd>
        </div>
      </dl>

      {pedido.pagamentos.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {pedido.pagamentos.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium tabular-nums">{formatarReais(g.valorCentavos)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {formatarData(g.data)} · {FORMA_LABEL[g.forma]}
                </span>
              </span>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={desfazendo || pending}
                aria-label={`Desfazer o pagamento de ${formatarReais(g.valorCentavos)}`}
                onClick={() =>
                  startDesfazer(async () => {
                    const r = await estornarPagamentoRevistaAction(g.id);
                    if (r.error) toast.error(r.error);
                    else if (r.success) toast.success(r.success);
                  })
                }
              >
                <Undo2 className="size-3" /> Desfazer
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {falta > 0 && !pedido.cancelado ? (
        <Formulario action={action} estado={state} className="flex flex-col gap-3">
          <input type="hidden" name="pedidoId" value={pedido.id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pag-valor">Valor (R$)</Label>
              <Input id="pag-valor" name="valor" inputMode="decimal" required defaultValue={emReais(falta)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pag-data">Data</Label>
              <Input id="pag-data" name="data" type="date" required defaultValue={hoje} max={hoje} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pag-forma">Forma</Label>
              <select id="pag-forma" name="forma" className={selectClasses} defaultValue="dinheiro">
                <option value="dinheiro">Dinheiro</option>
                <option value="pix">Pix</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Pagamento em partes: digite só o valor que a pessoa está pagando agora.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar} disabled={pending}>
              Fechar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Registrando..." : "Registrar pagamento"}
            </Button>
          </DialogFooter>
        </Formulario>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {pedido.cancelado
              ? "Pedido cancelado: o que foi recebido aparece acima, para devolver ou acertar com a pessoa."
              : "Este pedido já está todo pago."}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Fechar
            </Button>
          </DialogFooter>
        </>
      )}
    </div>
  );
}
