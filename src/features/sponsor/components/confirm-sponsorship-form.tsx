"use client";

import { Formulario } from "@/components/formulario";
import { useActionToast } from "@/hooks/useActionToast";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { startSponsorshipAction } from "@/server/actions/sponsor";

export function ConfirmSponsorshipForm({
  churchId,
  submitLabel,
}: {
  churchId: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(startSponsorshipAction, undefined);
  useActionToast(state);

  return (
    <Formulario action={formAction} estado={state} className="flex flex-col gap-3">
      <input type="hidden" name="churchId" value={churchId} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Registrando..." : submitLabel}
      </Button>
    </Formulario>
  );
}
