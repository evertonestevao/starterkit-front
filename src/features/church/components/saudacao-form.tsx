"use client";

import { Formulario } from "@/components/formulario";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { SAUDACAO_MAX, SAUDACAO_PADRAO, SAUDACOES_SUGERIDAS, saudar } from "@/lib/saudacao";
import { salvarSaudacaoAction } from "@/server/actions/saudacao";

/**
 * Como a igreja saúda nas mensagens prontas (WhatsApp de saudade, de visita,
 * convite ao sistema). Mostra um exemplo enquanto a pessoa digita.
 */
export function SaudacaoForm({ churchId, saudacao }: { churchId: string; saudacao: string }) {
  const [texto, setTexto] = useState(saudacao);
  const [state, formAction, pending] = useActionState(salvarSaudacaoAction, undefined);
  useActionToast(state);

  return (
    <Formulario action={formAction} estado={state} className="flex flex-col gap-3">
      <input type="hidden" name="churchId" value={churchId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="saudacao">Saudação</Label>
        <Input
          id="saudacao"
          name="saudacao"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={SAUDACAO_MAX}
          placeholder={SAUDACAO_PADRAO}
        />
        <div className="flex flex-wrap gap-1.5">
          {SAUDACOES_SUGERIDAS.map((sugestao) => (
            <button
              key={sugestao}
              type="button"
              onClick={() => setTexto(sugestao)}
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {sugestao}
            </button>
          ))}
        </div>
      </div>
      <p className="rounded-md bg-muted/50 p-3 text-sm">
        <span className="block text-xs text-muted-foreground">Exemplo de mensagem</span>
        {saudar(texto, "Maria")} Sentimos sua falta nos últimos cultos e queríamos saber como você está.
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar saudação"}
        </Button>
      </div>
    </Formulario>
  );
}
