"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/actions/action-state";

type FormAction = (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>;

/** Form de server action com o retorno em alerta, no padrão dos forms do painel. */
export function ActionForm({
  action,
  submitLabel,
  children,
  id,
  variant,
  size,
  className = "flex flex-col gap-4",
}: {
  action: FormAction;
  submitLabel: string;
  children?: React.ReactNode;
  id?: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
  size?: "default" | "sm";
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form id={id} action={formAction} className={className}>
      {state?.error ? (
        <Alert variant="destructive" className="basis-full">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.success ? (
        <Alert className="basis-full">
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      ) : null}
      {children}
      <Button type="submit" disabled={pending} variant={variant} size={size}>
        {pending ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}

export const SELECT_CLASS =
  "border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
