"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="churchId" value={churchId} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Registrando..." : submitLabel}
      </Button>
    </form>
  );
}
