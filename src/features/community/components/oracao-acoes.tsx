"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, CheckCheck, NotebookPen, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { textareaClasses } from "@/features/acompanhamento/components/campos";
import type { ActionState } from "@/server/actions/action-state";
import { OcultarPedido } from "./ocultar-pedido";
import {
  anotarPedidoOracaoAction,
  marcarPedidoOradoAction,
  marcarTodosOradosAction,
} from "@/server/actions/community";

/** Mostra o resultado de uma action chamada sem formulário. */
function avisar(result: ActionState) {
  if (result.error) toast.error(result.error);
  if (result.success) toast.success(result.success);
}

/** Ações de um pedido de oração: marcar "já oramos" (ou desfazer) e anotar. */
export function OracaoAcoes({
  pedidoId,
  orado,
  anotacao,
}: {
  pedidoId: string;
  orado: boolean;
  anotacao: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      {orado ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => startTransition(async () => avisar(await marcarPedidoOradoAction(pedidoId, false)))}
        >
          <Undo2 className="size-4" /> Desfazer
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => startTransition(async () => avisar(await marcarPedidoOradoAction(pedidoId, true)))}
        >
          <Check className="size-4" /> Já oramos
        </Button>
      )}
      <Anotar pedidoId={pedidoId} anotacao={anotacao} />
      <OcultarPedido tipo="oracao" pedidoId={pedidoId} />
    </div>
  );
}

function Anotar({ pedidoId, anotacao }: { pedidoId: string; anotacao: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [, formAction, pending] = useActionState(
    async (prev: ActionState | undefined, formData: FormData): Promise<ActionState> => {
      const result = await anotarPedidoOracaoAction(prev, formData);
      avisar(result);
      if (result.success) setAberto(false);
      return result;
    },
    undefined,
  );

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <NotebookPen className="size-4" /> {anotacao ? "Editar anotação" : "Anotar"}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anotação da liderança</DialogTitle>
            <DialogDescription>
              Fica só para quem administra a igreja. Quem enviou o pedido não vê.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="pedidoId" value={pedidoId} />
            <textarea
              name="anotacao"
              className={`${textareaClasses} min-h-24`}
              maxLength={500}
              defaultValue={anotacao ?? ""}
              placeholder="Ex.: o pastor ligou na quinta; família pediu para continuar orando."
              aria-label="Anotação"
            />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar anotação"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Marca de uma vez todos os pedidos que aguardam oração (ex.: depois de um culto de oração). */
export function MarcarTodosOrados({ pendentes }: { pendentes: number }) {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  if (pendentes < 2) return null;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <CheckCheck className="size-4" /> Marcar todos como orados
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar os {pendentes} pedidos como orados?</DialogTitle>
            <DialogDescription>
              Use depois de orar por todos, como num culto de oração. Vale para todos os pedidos que aguardam, não só
              os desta página. Dá para desfazer um por um depois.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await marcarTodosOradosAction();
                  avisar(result);
                  if (result.success) setAberto(false);
                })
              }
            >
              {pending ? "Marcando..." : "Sim, já oramos por todos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
