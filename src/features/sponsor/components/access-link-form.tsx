"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestSponsorAccessLinkAction } from "@/server/actions/sponsor";

/**
 * Entrar por link no email, sem senha.
 *
 * Não é conveniência: quem assina pela página pública nunca define senha, e
 * o único acesso é o link enviado na hora. Sem esta tela, perder aquele email
 * significa ficar trancado do lado de fora da própria assinatura.
 */
export function AccessLinkForm() {
  const [state, formAction, pending] = useActionState(
    requestSponsorAccessLinkAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.success ? (
        <Alert>
          <Mail className="size-4" />
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="access-email">Email</Label>
        <Input
          id="access-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          required
        />
      </div>

      <Button type="submit" variant="outline" disabled={pending} className="w-full gap-2">
        <Mail className="size-4" />
        {pending ? "Enviando..." : "Receber link de acesso"}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        Assinou pelo link de uma igreja? Você não criou senha — entre por aqui.
      </p>
    </form>
  );
}
