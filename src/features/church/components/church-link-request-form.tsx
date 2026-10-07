"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useActionToast } from "@/hooks/useActionToast";
import { formatChurchName } from "@/lib/churchName";
import { cn } from "@/lib/utils";
import { requestChurchLinkAction } from "@/server/actions/churchLinks";

/**
 * Pedir o vínculo, ou não querer. "Não quero" não envia nada nem avisa
 * ninguém: quem mandou o link só é avisado se a pessoa pedir. Depois do
 * pedido a página se atualiza e mostra o estado vindo do banco (aguardando a
 * aprovação), então a confirmação não depende deste formulário continuar na
 * tela.
 */
export function ChurchLinkRequestForm({
  token,
  churches,
}: {
  token: string;
  churches: Array<{ id: string; name: string; sobrenome: string | null }>;
}) {
  const [state, formAction, pending] = useActionState(requestChurchLinkAction, undefined);
  useActionToast(state);
  const [igreja, setIgreja] = useState(churches[0]?.id ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="churchId" value={igreja} />

      {churches.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Qual das suas igrejas vai pedir o vínculo?</legend>
          {churches.map((c) => (
            <label
              key={c.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                igreja === c.id ? "border-primary bg-primary/5" : "hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="igreja-escolhida"
                checked={igreja === c.id}
                onChange={() => setIgreja(c.id)}
                className="sr-only"
              />
              {formatChurchName(c.name, c.sobrenome)}
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm">
          Pede por: <strong>{formatChurchName(churches[0].name, churches[0].sobrenome)}</strong>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className="gap-1.5">
          <Check className="size-4" aria-hidden />
          {pending ? "Enviando..." : "Quero solicitar o vínculo"}
        </Button>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
          Não quero
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Se não quiser, nada é enviado e ninguém é avisado. Você pode simplesmente fechar esta página.
      </p>
    </form>
  );
}
