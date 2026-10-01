"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Check, MessageCircle, Phone, Undo2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { textareaClasses } from "@/features/acompanhamento/components/campos";
import { hojeISO, linkLigar, linkWhatsapp } from "@/lib/acompanhamento";
import type { ActionState } from "@/server/actions/action-state";
import { registrarVisitaAction } from "@/server/actions/community";

/** Ações de um pedido de visita: ligar, WhatsApp e marcar visita feita (ou desfazer). */
export function VisitaAcoes({
  visitorId,
  nome,
  telefone,
  feita,
}: {
  visitorId: string;
  nome: string;
  telefone: string;
  feita: boolean;
}) {
  const ligar = linkLigar(telefone);
  const whatsapp = linkWhatsapp(
    telefone,
    `A paz do Senhor, ${nome.split(" ")[0]}! Recebemos o seu pedido de visita pela página da igreja. Qual o melhor dia para irmos até você?`,
  );

  return (
    <div className="flex flex-wrap gap-2">
      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: "sm" })}
        >
          <MessageCircle className="size-4" /> WhatsApp
        </a>
      ) : null}
      {ligar ? (
        <a
          href={ligar}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Phone className="size-4" /> Ligar
        </a>
      ) : null}
      {feita ? (
        <Desfazer visitorId={visitorId} />
      ) : (
        <MarcarFeita visitorId={visitorId} nome={nome} />
      )}
    </div>
  );
}

/** Toast direto na action: depois de salvar, a linha pode sumir do filtro. */
function useRegistrar(onSuccess?: () => void) {
  return useActionState(
    async (
      prev: ActionState | undefined,
      formData: FormData,
    ): Promise<ActionState> => {
      const result = await registrarVisitaAction(prev, formData);
      if (result.error) toast.error(result.error);
      if (result.success) {
        toast.success(result.success);
        onSuccess?.();
      }
      return result;
    },
    undefined,
  );
}

function MarcarFeita({ visitorId, nome }: { visitorId: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [, formAction, pending] = useRegistrar(() => setAberto(false));

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAberto(true)}
      >
        <Check className="size-4" /> Visita feita
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Visita a {nome}</DialogTitle>
            <DialogDescription>
              Registre quando foi e quem visitou.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="visitorId" value={visitorId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`em-${visitorId}`}>Data da visita</Label>
              <Input
                id={`em-${visitorId}`}
                name="visitadoEm"
                type="date"
                defaultValue={hojeISO()}
                max={hojeISO()}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`por-${visitorId}`}>Quem visitou</Label>
              <Input
                id={`por-${visitorId}`}
                name="visitadoPor"
                required
                maxLength={120}
                placeholder="Ex.: Pr. João e irmã Maria"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`obs-${visitorId}`}>Como foi? (opcional)</Label>
              <textarea
                id={`obs-${visitorId}`}
                name="observacao"
                className={textareaClasses}
                maxLength={1000}
              />
            </div>
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="outline" disabled={pending} />
                }
              >
                Cancelar
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Registrar visita"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Desfazer({ visitorId }: { visitorId: string }) {
  const [, formAction, pending] = useRegistrar();
  return (
    <form action={formAction}>
      <input type="hidden" name="visitorId" value={visitorId} />
      <input type="hidden" name="desfazer" value="1" />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        title="Voltar para pendente"
      >
        <Undo2 className="size-4" /> Desfazer
      </Button>
    </form>
  );
}
