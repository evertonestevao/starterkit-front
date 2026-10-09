"use client";

import { Formulario } from "@/components/formulario";
import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/actions/action-state";
import { restaurarModulosAtivosAction, salvarModulosAtivosAction } from "@/server/actions/moduloAtivo";

export interface ModuloLinha {
  modulo: string;
  titulo: string;
  ativo: boolean;
  /** O que valeria sem a escolha desta igreja. */
  herdado: boolean;
  /** Igreja acima que definiu; null = ninguém acima definiu. */
  herdadoDe: string | null;
  /** Esta igreja mudou este ponto. */
  propria: boolean;
}

/** Liga/desliga por igreja, acima do cargo: desligado, some do menu de todo mundo. */
export function ModulosAtivosForm({ modulos }: { modulos: ModuloLinha[] }) {
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    salvarModulosAtivosAction,
    undefined,
  );
  const [restaurando, startRestaurar] = useTransition();

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    if (state?.success) toast.success(state.success);
  }, [state]);

  const temPropria = modulos.some((m) => m.propria);
  const acima = modulos.find((m) => m.herdadoDe)?.herdadoDe ?? null;

  function restaurar() {
    startRestaurar(async () => {
      const result = await restaurarModulosAtivosAction();
      if (result.error) toast.error(result.error);
      if (result.success) toast.success(result.success);
    });
  }

  return (
    <Formulario action={formAction} estado={state} className="flex flex-col gap-4">
      {acima ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          {temPropria
            ? `Esta igreja tem configuração própria: o que ${acima} mudar não chega mais aqui. Para voltar a acompanhar, use "Voltar a seguir ${acima}".`
            : `Esta igreja segue ${acima}: o que for mudado lá vale aqui. Ao salvar uma mudança, ela passa a ter configuração própria e deixa de acompanhar.`}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {modulos.map((m) => (
          <label key={m.modulo} className="flex items-start gap-2 text-sm">
            <input
              key={String(m.ativo)}
              type="checkbox"
              name={`modulo_${m.modulo}`}
              defaultChecked={m.ativo}
              className="mt-0.5 size-4"
            />
            <span>
              {m.titulo}
              {m.propria && m.herdadoDe && m.ativo !== m.herdado ? (
                <span className="block text-xs text-muted-foreground">
                  diferente de {m.herdadoDe} (lá {m.herdado ? "ativo" : "desligado"})
                </span>
              ) : !m.propria && m.herdadoDe ? (
                <span className="block text-xs text-muted-foreground">herdado de {m.herdadoDe}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || restaurando}>
          {pending ? "Salvando..." : "Salvar módulos"}
        </Button>
        {temPropria ? (
          <Button type="button" variant="outline" disabled={pending || restaurando} onClick={restaurar}>
            <RotateCcw className="size-4" />{" "}
            {restaurando ? "Restaurando..." : acima ? `Voltar a seguir ${acima}` : "Voltar ao padrão"}
          </Button>
        ) : null}
      </div>
    </Formulario>
  );
}
