"use client";

import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/actions/action-state";
import { restaurarAcessosAction, salvarAcessosAction } from "@/server/actions/menuPermissoes";

export interface CargoAcessos {
  cargoId: string;
  nome: string;
  modulos: Array<{
    modulo: string;
    titulo: string;
    permitido: boolean;
    /** O que valeria sem a escolha desta igreja. */
    herdado: boolean;
    /** Igreja acima que definiu; null = ninguém definiu (não liberado). */
    herdadoDe: string | null;
    /** Esta igreja mudou este ponto. */
    propria: boolean;
  }>;
}

/** Um bloco por cargo, com uma caixa por módulo liberável. */
export function AcessosForm({ cargos }: { cargos: CargoAcessos[] }) {
  const [state, formAction, pending] = useActionState<ActionState | undefined, FormData>(
    salvarAcessosAction,
    undefined,
  );
  const [restaurando, startRestaurar] = useTransition();

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    if (state?.success) toast.success(state.success);
  }, [state]);

  const temPropria = cargos.some((c) => c.modulos.some((m) => m.propria));
  // Igreja acima que definiu algo (a mais próxima); null = ninguém acima definiu.
  const acima = cargos.flatMap((c) => c.modulos).find((m) => m.herdadoDe)?.herdadoDe ?? null;

  function restaurar() {
    startRestaurar(async () => {
      const result = await restaurarAcessosAction();
      if (result.error) toast.error(result.error);
      if (result.success) toast.success(result.success);
    });
  }

  if (cargos.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum cargo disponível. Crie cargos em Configurações → Cargos.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {acima ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          {temPropria
            ? `Esta igreja tem configuração própria: o que ${acima} mudar não chega mais aqui. Para voltar a acompanhar, use "Voltar a seguir ${acima}".`
            : `Esta igreja segue ${acima}: o que for mudado lá vale aqui. Ao salvar uma mudança, ela passa a ter configuração própria e deixa de acompanhar.`}
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {cargos.map((cargo) => (
          <li key={cargo.cargoId} className="rounded-lg border p-3">
            <input type="hidden" name="cargo" value={cargo.cargoId} />
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">{cargo.nome}</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {cargo.modulos.map((m) => (
                  <label key={m.modulo} className="flex items-start gap-2 text-sm">
                    {/* key com o valor: depois de salvar/restaurar, a caixa volta a refletir o banco. */}
                    <input
                      key={String(m.permitido)}
                      type="checkbox"
                      name={`c:${cargo.cargoId}:${m.modulo}`}
                      defaultChecked={m.permitido}
                      className="mt-0.5 size-4"
                    />
                    <span>
                      {m.titulo}
                      {m.propria && m.herdadoDe && m.permitido !== m.herdado ? (
                        <span className="block text-xs text-muted-foreground">
                          diferente de {m.herdadoDe} (lá {m.herdado ? "libera" : "não libera"})
                        </span>
                      ) : !m.propria && m.herdadoDe ? (
                        <span className="block text-xs text-muted-foreground">herdado de {m.herdadoDe}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || restaurando}>
          {pending ? "Salvando..." : "Salvar acessos"}
        </Button>
        {temPropria ? (
          <Button type="button" variant="outline" disabled={pending || restaurando} onClick={restaurar}>
            <RotateCcw className="size-4" />{" "}
            {restaurando ? "Restaurando..." : acima ? `Voltar a seguir ${acima}` : "Remover todas as liberações"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
