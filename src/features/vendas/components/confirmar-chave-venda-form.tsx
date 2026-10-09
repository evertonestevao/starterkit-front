"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/hooks/useActionToast";
import { mascaraTelefone } from "@/lib/telefone";
import { confirmarChaveVendaAction } from "@/server/actions/publicVendas";

/**
 * Última conferência antes de a venda ir para a página: o Responsável vê a
 * chave INTEIRA (o e-mail só mostra o começo e o fim) e confirma.
 */
export function ConfirmarChaveVendaForm({
  token,
  chave,
  titular,
  whatsapp,
}: {
  token: string;
  chave: string;
  titular: string | null;
  whatsapp: string | null;
}) {
  const [state, action, pending] = useActionState(confirmarChaveVendaAction, undefined);
  useActionToast(state);

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
          <dt className="text-xs text-muted-foreground">Chave Pix</dt>
          <dd className="font-medium break-all">{chave}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Quem recebe</dt>
          <dd className="font-medium">{titular ?? "—"}</dd>
        </div>
        {whatsapp ? (
          <div>
            <dt className="text-xs text-muted-foreground">WhatsApp para o comprovante</dt>
            <dd className="font-medium">{mascaraTelefone(whatsapp)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-sm text-muted-foreground">
        Confira com quem organiza a venda. Se a chave, o nome ou o WhatsApp não forem os esperados, não confirme: feche esta
        página, troque a senha da sua conta e avise a equipe.
      </p>
      <Button type="submit" disabled={pending} className="self-start">
        Confirmar esta chave
      </Button>
    </form>
  );
}
