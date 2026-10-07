"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/server/actions/action-state";

/**
 * Mostra o resultado de uma Server Action (useActionState) como toast — verde
 * para sucesso, vermelho para erro — em vez de um Alert fixo dentro do
 * formulário. `state` só muda de referência quando a action roda de verdade
 * (useActionState devolve um objeto novo a cada dispatch), então o efeito não
 * repete o toast em re-renders comuns; isto não é "setState em efeito", é uma
 * chamada a um sistema externo (a fila de toasts), o uso legítimo de effect.
 */
export function useActionToast(state: ActionState | undefined): void {
  useEffect(() => {
    if (state?.error) toast.error(state.error);
    else if (state?.success) toast.success(state.success);
  }, [state]);
}
