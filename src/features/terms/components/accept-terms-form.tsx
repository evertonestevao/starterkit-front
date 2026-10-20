"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { acceptTermsAction } from "@/server/actions/terms";
import { TermsCheckboxes } from "./terms-checkboxes";

export function AcceptTermsForm() {
  const [state, formAction, pending] = useActionState(acceptTermsAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <TermsCheckboxes />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Registrando..." : "Aceitar e continuar"}
      </Button>
    </form>
  );
}
