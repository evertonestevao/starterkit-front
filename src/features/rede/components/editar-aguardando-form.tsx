"use client";

import { useActionState } from "react";
import { Formulario } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoEnderecoDaIgreja } from "@/features/church/components/campo-endereco-da-igreja";
import { useActionToast } from "@/hooks/useActionToast";
import { editarIgrejaAguardandoAction } from "@/server/actions/redeCadastro";
import type { IgrejaAguardando } from "@/services/redeCadastroService";

/**
 * Preparar a página da igreja enquanto ninguém assumiu: nome, complemento,
 * endereço e "Sobre". Depois que alguém assume, só a própria igreja edita.
 */
export function EditarAguardandoForm({ igreja }: { igreja: IgrejaAguardando }) {
  const [state, action, pending] = useActionState(editarIgrejaAguardandoAction, undefined);
  useActionToast(state);

  return (
    <Formulario action={action} estado={state} className="flex flex-col gap-3">
      <input type="hidden" name="churchId" value={igreja.churchId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`ed-nome-${igreja.churchId}`}>Nome da igreja</Label>
          <Input
            id={`ed-nome-${igreja.churchId}`}
            name="name"
            required
            minLength={2}
            maxLength={120}
            defaultValue={igreja.nomeProprio}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`ed-sob-${igreja.churchId}`}>Complemento</Label>
          <Input id={`ed-sob-${igreja.churchId}`} name="sobrenome" maxLength={120} defaultValue={igreja.sobrenome ?? ""} />
        </div>
      </div>
      <CampoEnderecoDaIgreja endereco={igreja.endereco} enderecoAntigo={null} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`ed-sobre-${igreja.churchId}`}>Sobre a igreja (opcional)</Label>
        <textarea
          id={`ed-sobre-${igreja.churchId}`}
          name="sobre"
          maxLength={1500}
          rows={3}
          defaultValue={igreja.sobre ?? ""}
          className="min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
        />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Salvando..." : "Salvar dados"}
      </Button>
    </Formulario>
  );
}
