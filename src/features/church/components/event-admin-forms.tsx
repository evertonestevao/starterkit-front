"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
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
  useActionToast(state);
  const [removeState, removeAction, removing] = useActionState(removeChurchEventAction, undefined);
  useActionToast(removeState);

  // Mesmo problema do formulário de perfil da igreja e do de programação:
  // campos não controlados (defaultValue) dentro de um item cujo <li key=...>
  // não muda ao editar. Uma key no <form> derivada de tudo que alimenta
  // defaultValue força a remontagem só quando um salvamento troca algo de
  // verdade, evitando o aviso do Base UI sobre FieldControl não controlado.
  const versaoDoEvento = [
    evento.id,
    evento.titulo,
    evento.inicio,
    evento.fim ?? "",
    evento.local ?? "",
    evento.precoCents,
    evento.descricao ?? "",
    evento.inscricoesAbertas,
  ].join("\u0000");

  return (
    <div className="flex flex-col gap-3 border-t px-3 py-3">
      <form key={versaoDoEvento} action={formAction} className="flex flex-col gap-3">
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
