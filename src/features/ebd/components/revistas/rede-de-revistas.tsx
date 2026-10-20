"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Formulario } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { textoDoPedidoDaRede, totalDaRede } from "@/lib/ebdRevistas";
import { cn } from "@/lib/utils";
import { removerPedidoExternoAction, salvarPedidoExternoAction } from "@/server/actions/ebdRevistas";
import type { EbdRevista, EbdRevistasRede } from "@/types/ebdRevistas";

type Externo = EbdRevistasRede["externos"][number];

/**
 * Aba Rede: a compra única da igreja que define a lista, somando ela, as
 * congregações do sistema e as de fora. Só números: quem pediu, quem pagou e
 * quem deve ficam com cada congregação.
 */
export function RedeDeRevistas({
  trimestreId,
  trimestreNome,
  igreja,
  revistas,
  rede,
}: {
  trimestreId: string;
  trimestreNome: string;
  igreja: string;
  revistas: EbdRevista[];
  rede: EbdRevistasRede;
}) {
  const [editando, setEditando] = useState<Externo | "novo" | null>(null);
  const [pending, startTransition] = useTransition();
  const { copied, copy } = useCopyToClipboard(2500);
  const total = totalDaRede(rede, revistas);
  const congregacoes = rede.igrejas.filter((i) => !i.propria);
  const semPedido = congregacoes.filter((i) => i.pedidos === 0);
  const comPedido = rede.igrejas.filter((i) => i.pedidos > 0).length;
  const resumoDasFontes = [
    `${comPedido} ${comPedido === 1 ? "igreja" : "igrejas"} com pedido no sistema`,
    ...(rede.externos.length > 0
      ? [`${rede.externos.length} ${rede.externos.length === 1 ? "congregação" : "congregações"} fora do sistema`]
      : []),
  ].join(" e ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <p className="max-w-2xl text-sm text-muted-foreground">
          O que comprar em {trimestreNome}: os pedidos desta igreja e das congregações ligadas a ela, somados conforme
          cada uma registra. Aqui aparecem só as quantidades; quem pediu e quem pagou ficam com cada congregação.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={revistas.length === 0}
            onClick={() => setEditando("novo")}
          >
            <Plus className="size-4" /> Pedido de congregação
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={total.total === 0}
            onClick={() => copy(textoDoPedidoDaRede({ igreja, trimestre: trimestreNome, rede: total }))}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={total.total === 0} onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir
          </Button>
        </div>
      </div>

      {/* O que importa aqui: quantas de cada revista comprar, somando todas as igrejas. */}
      <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Total a comprar</p>
            <p className="text-lg font-semibold">Pedido de revistas da EBD · {trimestreNome}</p>
            <p className="text-sm text-muted-foreground">
              {igreja} e congregações · somando {resumoDasFontes}
            </p>
          </div>
          <p className="shrink-0 sm:text-right">
            <span className="block text-4xl font-bold leading-none tabular-nums">{total.total}</span>
            <span className="text-sm text-muted-foreground">{total.total === 1 ? "revista" : "revistas"}</span>
          </p>
        </div>
        {total.linhas.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nenhuma revista pedida ainda neste trimestre.</p>
        ) : (
          <table className="mt-4 w-full text-base">
            <thead>
              <tr className="border-b border-primary/20 text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Revista</th>
                <th className="py-2 text-right font-medium">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {total.linhas.map((l) => (
                <tr key={l.revistaId} className="border-b border-primary/10 last:border-0">
                  <td className="py-2">{l.titulo}</td>
                  <td className="py-2 text-right text-xl font-bold tabular-nums">{l.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-primary/30">
                <td className="py-2 font-semibold">Total</td>
                <td className="py-2 text-right text-2xl font-bold tabular-nums">{total.total}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Quanto cada igreja pediu</p>
        {semPedido.length > 0 ? (
          <p className="text-xs text-muted-foreground print:hidden">
            Ainda sem pedido no sistema: {semPedido.map((i) => i.nome).join(", ")}.
          </p>
        ) : null}
        <ul className="grid gap-2 sm:grid-cols-2">
          {total.colunas.map((col, indice) => {
            const externo = col.externo ? rede.externos.find((e) => e.id === col.chave) : undefined;
            const linhas = total.linhas.filter((l) => l.quantidades[indice] > 0);
            return (
              <li
                key={col.chave}
                className={cn("flex flex-col gap-1.5 rounded-lg border p-3 text-sm", col.total === 0 && "opacity-70")}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{col.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {col.externo
                        ? "Fora do sistema · quantidades informadas aqui"
                        : `${col.pedidos} ${col.pedidos === 1 ? "pedido" : "pedidos"} no sistema`}
                    </span>
                  </span>
                  <span className="shrink-0 text-base font-semibold tabular-nums">{col.total}</span>
                </div>
                {linhas.length > 0 ? (
                  <ul className="text-xs text-muted-foreground">
                    {linhas.map((l) => (
                      <li key={l.revistaId} className="flex justify-between gap-2">
                        <span className="truncate">{l.titulo}</span>
                        <span className="tabular-nums">{l.quantidades[indice]}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhuma revista pedida ainda.</p>
                )}
                {externo ? (
                  <div className="flex gap-1 print:hidden">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setEditando(externo)}
                    >
                      <Pencil className="size-3" /> Alterar
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={pending}
                      aria-label={`Remover o pedido de ${externo.nome}`}
                      onClick={async () => {
                        const sim = await confirmar({
                          titulo: `Remover o pedido de ${externo.nome}?`,
                          descricao: "As quantidades saem do total da rede.",
                          botao: "Remover",
                          perigo: true,
                        });
                        if (!sim) return;
                        startTransition(async () => {
                          const r = await removerPedidoExternoAction(externo.id);
                          if (r.error) toast.error(r.error);
                          else if (r.success) toast.success(r.success);
                        });
                      }}
                    >
                      <Trash2 className="size-3" /> Remover
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <Dialog open={editando !== null} onOpenChange={(aberto) => !aberto && setEditando(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando === "novo" ? "Pedido de congregação" : "Alterar pedido de congregação"}</DialogTitle>
            <DialogDescription>
              Para congregação que ainda não usa o sistema: informe quantas revistas de cada ela precisa. Entra no total
              da rede; o controle de quem pagou fica com ela.
            </DialogDescription>
          </DialogHeader>
          {editando !== null ? (
            <PedidoExternoForm
              trimestreId={trimestreId}
              revistas={revistas}
              externo={editando === "novo" ? undefined : editando}
              onFechar={() => setEditando(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PedidoExternoForm({
  trimestreId,
  revistas,
  externo,
  onFechar,
}: {
  trimestreId: string;
  revistas: EbdRevista[];
  externo?: Externo;
  onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(salvarPedidoExternoAction, undefined);
  useActionToast(state);
  // Fechar o diálogo é efeito do resultado da action (sistema externo: o diálogo do pai).
  useEffect(() => {
    if (state?.success) onFechar();
  }, [state, onFechar]);
  const [quantidades, setQuantidades] = useState<Record<string, number>>(() =>
    Object.fromEntries((externo?.itens ?? []).map((i) => [i.revistaId, i.quantidade])),
  );
  const algumaRevista = Object.values(quantidades).some((q) => q > 0);

  return (
    <Formulario action={action} estado={state} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={externo?.id ?? ""} />
      <input type="hidden" name="trimestreId" value={trimestreId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="externo-nome">Nome da congregação</Label>
        <Input
          id="externo-nome"
          name="nome"
          required
          minLength={2}
          maxLength={120}
          defaultValue={externo?.nome ?? ""}
          placeholder="Ex.: Congregação Jardim das Flores"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Quantas de cada revista</legend>
        <ul className="flex flex-col divide-y rounded-lg border">
          {revistas.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <label htmlFor={`ext-${r.id}`} className="min-w-0 truncate font-medium">
                {r.titulo}
              </label>
              <Input
                id={`ext-${r.id}`}
                name={`revista_${r.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={2000}
                value={quantidades[r.id] ? quantidades[r.id] : ""}
                placeholder="0"
                onChange={(e) =>
                  setQuantidades((q) => ({ ...q, [r.id]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))
                }
                className="w-24 text-right"
                aria-label={`Quantidade de ${r.titulo}`}
              />
            </li>
          ))}
        </ul>
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !algumaRevista}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </Formulario>
  );
}
