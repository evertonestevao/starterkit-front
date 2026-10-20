"use client";

import { Formulario } from "@/components/formulario";
import { useActionToast } from "@/hooks/useActionToast";
import { useActionState } from "react";
import { Mail } from "lucide-react";
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
  useActionToast(state);

  return (
    <Formulario action={formAction} estado={state} className="flex flex-col gap-3">

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
    </Formulario>
  );
}
