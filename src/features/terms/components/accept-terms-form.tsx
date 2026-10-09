"use client";

import { Formulario } from "@/components/formulario";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/hooks/useActionToast";
import { acceptTermsAction } from "@/server/actions/terms";
import { TermsCheckboxes } from "./terms-checkboxes";

export function AcceptTermsForm() {
  const [state, formAction, pending] = useActionState(acceptTermsAction, undefined);
  useActionToast(state);

  return (
    <Formulario action={formAction} estado={state} className="flex flex-col gap-4">
      <TermsCheckboxes />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Registrando..." : "Aceitar e continuar"}
      </Button>
    </Formulario>
  );
}
