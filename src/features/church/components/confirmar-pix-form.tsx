"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { confirmarPixPorEmailAction } from "@/server/actions/churchPix";

/**
 * Última conferência antes de a chave ir para a página: o Responsável vê a
 * chave INTEIRA (o e-mail só mostra o começo e o fim) e confirma.
 */
export function ConfirmarPixForm({ token, chave, titular }: { token: string; chave: string; titular: string | null }) {
  const [state, action, pending] = useActionState(confirmarPixPorEmailAction, undefined);

  if (state?.success) {
    return (
      <Alert>
        <CheckCircle2 className="size-4" />
        <AlertDescription>{state.success}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <dl className="flex flex-col gap-3 rounded-lg border p-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Chave</dt>
          <dd className="font-medium break-all">{chave}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Titular</dt>
          <dd className="font-medium">{titular ?? "—"}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        Confira com a conta da igreja. Se a chave ou o titular não forem os que você espera, não confirme: feche esta
        página, troque a senha da sua conta e corrija a chave no painel.
      </p>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        Confirmar esta chave
      </Button>
    </form>
  );
}
