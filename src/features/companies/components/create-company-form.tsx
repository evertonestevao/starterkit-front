"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TermsCheckboxes } from "@/features/terms/components/terms-checkboxes";
import { useActionToast } from "@/hooks/useActionToast";
import { createCompanyAction } from "@/server/actions/tenant";

export function CreateCompanyForm({
  requireTerms = false,
  next,
}: {
  requireTerms?: boolean;
  /** Para onde voltar depois de criar a igreja (só um link de vínculo; o servidor confere). */
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createCompanyAction,
    undefined,
  );
  useActionToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
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
