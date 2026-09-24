"use client";

import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { reviewProfileChangeAction } from "@/server/actions/platform";
import type { PendingProfileChange } from "@/types/sponsorship";

/**
 * Decisão de uma alteração pendente.
 *
 * O campo de motivo só aparece ao recusar: pedi-lo sempre faria a aprovação —
 * que é o caso comum — custar uma digitação à toa. Recusar sem motivo é
 * barrado no service, porque o patrocinador precisa saber o que corrigir.
 */
export function ProfileChangeReview({ change }: { change: PendingProfileChange }) {
  const [state, formAction, pending] = useActionState(reviewProfileChangeAction, undefined);
  useActionToast(state);
  const [recusando, setRecusando] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="changeId" value={change.id} />

      {recusando ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`motivo-${change.id}`}>Motivo da recusa</Label>
          <Input
            id={`motivo-${change.id}`}
            name="motivo"
            required
            maxLength={280}
            placeholder="O patrocinador vai ler isto."
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {recusando ? (
          <>
            <Button
              type="submit"
              name="decisao"
              value="recusar"
              variant="destructive"
              size="sm"
              disabled={pending}
              className="gap-1.5"
            >
              <X className="size-4" aria-hidden />
              Confirmar recusa
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRecusando(false)}
              disabled={pending}
            >
              Voltar
            </Button>
          </>
        ) : (
          <>
            <Button
              type="submit"
              name="decisao"
              value="aprovar"
              size="sm"
              disabled={pending}
              className="gap-1.5"
            >
              <Check className="size-4" aria-hidden />
              Aprovar e publicar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRecusando(true)}
              disabled={pending}
            >
              Recusar
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
