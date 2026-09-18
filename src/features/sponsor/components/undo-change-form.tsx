"use client";

import { useActionState } from "react";
import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { undoProfileChangeAction } from "@/server/actions/platform";

/**
 * Botão do "não fui eu".
 *
 * É POST, não link: vários clientes de email pré-carregam URLs, e num GET o
 * scanner de antivírus do destinatário bloquearia a conta sozinho.
 */
export function UndoChangeForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(undoProfileChangeAction, undefined);

  if (state?.success) {
    return (
      <Alert>
        <ShieldAlert className="size-4" />
        <AlertDescription>{state.success}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <Button type="submit" variant="destructive" disabled={pending} className="w-full">
        {pending ? "Desfazendo..." : "Desfazer e bloquear minha conta"}
      </Button>
    </form>
  );
}
