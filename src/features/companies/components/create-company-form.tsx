"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TermsCheckboxes } from "@/features/terms/components/terms-checkboxes";
import { createCompanyAction } from "@/server/actions/tenant";

export function CreateCompanyForm({
  requireTerms = false,
}: {
  requireTerms?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createCompanyAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome da igreja</Label>
        <Input
          id="name"
          name="name"
          placeholder="Igreja Esperança"
          minLength={2}
          required
        />
      </div>
      {/* Onboarding (1º acesso): aceite dos termos vigentes antes de criar.
          O required do checkbox é UX; a validação real é na server action. */}
      {requireTerms ? <TermsCheckboxes /> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Criando..." : "Criar igreja"}
      </Button>
    </form>
  );
}
