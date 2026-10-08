"use client";

import { useActionToast } from "@/hooks/useActionToast";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/actions/action-state";

type AuthAction = (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>;

interface AuthFormProps {
  action: AuthAction;
  submitLabel: string;
  children: React.ReactNode;
}

/**
 * Casca comum dos forms de auth: useActionState + exibição padronizada de
 * erro/sucesso + botão com estado pending. Os campos vêm como children.
 */
export function AuthForm({ action, submitLabel, children }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  useActionToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Aguarde..." : submitLabel}
      </Button>
    </form>
  );
}
