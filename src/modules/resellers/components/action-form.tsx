"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionState } from "@/server/actions/action-state";

type FormAction = (prev: ActionState | undefined, formData: FormData) => Promise<ActionState>;

/**
 * Form de server action do painel. Sucesso vira toast, porque a linha do form pode sumir
 * ao revalidar; erro fica no lugar. Submete pelo onSubmit: com <form action> o React limpa
 * os campos mesmo em erro, e a pessoa perderia o que digitou.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  id,
  variant,
  size,
  className = "flex flex-col gap-4",
  resetOnSuccess = false,
  submitDisabled = false,
  confirm,
}: {
  action: FormAction;
  submitLabel: string;
  children?: React.ReactNode;
  id?: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
  size?: "default" | "sm";
  className?: string;
  resetOnSuccess?: boolean;
  submitDisabled?: boolean;
  /** Ação difícil de desfazer: pede confirmação antes de enviar. */
  confirm?: { title: string; description: string; confirmLabel: string };
}) {
  // Toast aqui, e não num efeito: ao revalidar, este form pode já ter saído da tela.
  const [state, dispatch, pending] = useActionState(async (prev: ActionState | undefined, data: FormData) => {
    const result = await action(prev, data);
    if (result.success) toast.success(result.success);
    return result;
  }, undefined);
  const [pendingData, setPendingData] = useState<FormData | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  function send(data: FormData) {
    startTransition(() => dispatch(data));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (confirm) setPendingData(data);
    else send(data);
  }

  return (
    <>
      <form ref={formRef} id={id} onSubmit={onSubmit} className={className}>
        {state?.error ? (
          <Alert variant="destructive" className="basis-full md:col-span-full">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {children}
        <Button type="submit" disabled={pending || submitDisabled} variant={variant} size={size}>
          {pending ? "Salvando..." : submitLabel}
        </Button>
      </form>
      {confirm ? (
        <Dialog open={pendingData !== null} onOpenChange={(open) => !open && setPendingData(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirm.title}</DialogTitle>
              <DialogDescription>{confirm.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <Button
                variant={variant === "destructive" ? "destructive" : "default"}
                onClick={() => {
                  if (pendingData) send(pendingData);
                  setPendingData(null);
                }}
              >
                {confirm.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

export const SELECT_CLASS =
  "border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
