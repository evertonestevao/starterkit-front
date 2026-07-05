"use client";

import { useActionState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/providers/tenant-provider";
import { updateCompanyAction, leaveCompanyAction } from "@/server/actions/tenant";
import { updateProfileAction } from "@/server/actions/user";

export function CompanyNameForm() {
  const { active } = useTenant();
  const [state, formAction, pending] = useActionState(updateCompanyAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.success ? (
        <Alert>
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="companyId" value={active.id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="company-name">Nome da empresa</Label>
        <Input id="company-name" name="name" defaultValue={active.name} minLength={2} required />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}

export function ProfileForm({ initialName }: { initialName: string }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.success ? (
        <Alert>
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-name">Seu nome</Label>
        <Input id="profile-name" name="fullName" defaultValue={initialName} minLength={2} required />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}

export function LeaveCompanyButton() {
  const { active } = useTenant();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="destructive"
      disabled={pending}
      onClick={() => startTransition(() => leaveCompanyAction(active.id))}
    >
      {pending ? "Saindo..." : `Sair de ${active.name}`}
    </Button>
  );
}
