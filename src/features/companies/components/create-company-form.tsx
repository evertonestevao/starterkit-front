"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCompanyAction } from "@/server/actions/tenant";

export function CreateCompanyForm() {
  const [state, formAction, pending] = useActionState(createCompanyAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome da empresa</Label>
        <Input id="name" name="name" placeholder="Minha Empresa" minLength={2} required />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Criando..." : "Criar empresa"}
      </Button>
    </form>
  );
}
