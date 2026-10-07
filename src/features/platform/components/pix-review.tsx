"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/server/actions/action-state";
import { decidirPixAction } from "@/server/actions/platform";

/** Aprovar ou recusar a chave Pix de uma igreja. A recusa pede o motivo, que a igreja lê. */
export function PixReview({ churchId }: { churchId: string }) {
  // Aviso direto na action: decidida, a chave sai da fila e este cartão desmonta
  // antes de qualquer efeito rodar.
  const [, formAction, pending] = useActionState(
    async (prev: ActionState | undefined, formData: FormData): Promise<ActionState> => {
      const result = await decidirPixAction(prev, formData);
      if (result.error) toast.error(result.error);
      if (result.success) toast.success(result.success);
      return result;
    },
    undefined,
  );
  const [recusando, setRecusando] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="churchId" value={churchId} />
      {recusando ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`motivo-${churchId}`}>Motivo da recusa</Label>
          <Input
            id={`motivo-${churchId}`}
            name="motivo"
            required
            minLength={5}
            maxLength={300}
            placeholder="Ex.: o titular da chave não confere com o nome da igreja"
          />
          <p className="text-xs text-muted-foreground">A igreja vê este texto na tela do Pix.</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {recusando ? (
          <>
            <Button type="submit" name="decisao" value="recusar" variant="destructive" size="sm" disabled={pending}>
              <X className="size-4" /> Confirmar recusa
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setRecusando(false)}>
              Voltar
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" name="decisao" value="aprovar" size="sm" disabled={pending}>
              <Check className="size-4" /> Aprovar
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setRecusando(true)}>
              Recusar
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
