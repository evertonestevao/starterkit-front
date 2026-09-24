"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/server/actions/action-state";

/**
 * Roda uma Server Action e avisa o resultado por toast — para botões que MUDAM
 * a tela onde estão.
 *
 * `useActionToast` só avisa depois que o componente re-renderiza com o estado
 * novo. Numa ação que faz o próprio botão sumir (desfazer um vínculo, cancelar
 * um convite), a página é atualizada na mesma resposta, o componente é
 * desmontado e o aviso nunca aparece. Aqui o toast sai da própria chamada, que
 * segue viva mesmo com o botão já fora da tela.
 */
export function useToastedAction(
  action: (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>,
) {
  const [pending, startTransition] = useTransition();

  function run(formData: FormData) {
    startTransition(async () => {
      const result = await action(undefined, formData);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
    });
  }

  return [run, pending] as const;
}
