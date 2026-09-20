"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToBrl, isoToBrasiliaLocal } from "@/lib/churchEvents";
import { removeChurchEventAction, updateChurchEventAction } from "@/server/actions/churchEvents";

export interface EditableEvent {
  id: string;
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string | null;
  local: string | null;
  precoCents: number;
  inscricoesAbertas: boolean;
}

/**
 * Editar e remover um evento publicado.
 *
 * Remover é soft delete: o evento sai da página, e as inscrições ficam. Quem
 * já se inscreveu precisa continuar aparecendo na lista para ser avisado de
 * que o evento não vai acontecer — apagar as inscrições junto seria apagar
 * justamente as pessoas que a igreja precisa procurar.
 */
export function EventAdminForms({ evento }: { evento: EditableEvent }) {
  const [state, formAction, pending] = useActionState(updateChurchEventAction, undefined);
  const [removeState, removeAction, removing] = useActionState(removeChurchEventAction, undefined);

  return (
    <div className="flex flex-col gap-3 border-t px-3 py-3">
      {state?.error || removeState?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state?.error ?? removeState?.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.success || removeState?.success ? (
        <Alert>
          <AlertDescription>{state?.success ?? removeState?.success}</AlertDescription>
        </Alert>
      ) : null}

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="eventId" value={evento.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={`titulo-${evento.id}`}>Nome</Label>
            <Input id={`titulo-${evento.id}`} name="titulo" required defaultValue={evento.titulo} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`inicio-${evento.id}`}>Começa</Label>
            <Input
              id={`inicio-${evento.id}`}
              name="inicio"
              type="datetime-local"
              required
              defaultValue={isoToBrasiliaLocal(evento.inicio)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`fim-${evento.id}`}>Termina (opcional)</Label>
            <Input
              id={`fim-${evento.id}`}
              name="fim"
              type="datetime-local"
              defaultValue={evento.fim ? isoToBrasiliaLocal(evento.fim) : ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`local-${evento.id}`}>Local (opcional)</Label>
            <Input id={`local-${evento.id}`} name="local" defaultValue={evento.local ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`preco-${evento.id}`}>Valor (0 para gratuito)</Label>
            <Input
              id={`preco-${evento.id}`}
              name="preco"
              inputMode="decimal"
              defaultValue={centsToBrl(evento.precoCents)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={`descricao-${evento.id}`}>Descrição (opcional)</Label>
            <Input
              id={`descricao-${evento.id}`}
              name="descricao"
              defaultValue={evento.descricao ?? ""}
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="inscricoesAbertas"
              defaultChecked={evento.inscricoesAbertas}
              className="size-4"
            />
            Aceitar novas inscrições
          </label>
        </div>
        <div>
          <Button type="submit" size="sm" disabled={pending}>
            Salvar alterações
          </Button>
        </div>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="eventId" value={evento.id} />
        <Button type="submit" size="sm" variant="ghost" className="gap-1.5 text-destructive" disabled={removing}>
          <Trash2 className="size-3.5" aria-hidden />
          Tirar da página
        </Button>
      </form>
    </div>
  );
}
