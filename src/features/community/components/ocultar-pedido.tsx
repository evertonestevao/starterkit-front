"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EyeOff } from "lucide-react";
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
import { ocultarPedidoAction } from "@/server/actions/community";

/**
 * Tira da lista um pedido ofensivo ou de spam vindo da página pública
 * (oração ou visita). Pede confirmação: não volta pela tela.
 */
export function OcultarPedido({ tipo, pedidoId }: { tipo: "oracao" | "visita"; pedidoId: string }) {
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(true)}>
        <EyeOff className="size-4" /> Ocultar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ocultar este pedido?</DialogTitle>
            <DialogDescription>
              Use para mensagem ofensiva, propaganda ou envio falso. O pedido sai da lista e dos números, e não volta
              por esta tela.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await ocultarPedidoAction(tipo, pedidoId);
                  if (result.error) toast.error(result.error);
                  if (result.success) {
                    toast.success(result.success);
                    setAberto(false);
                  }
                })
              }
            >
              {pending ? "Ocultando..." : "Sim, ocultar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
