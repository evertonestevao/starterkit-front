"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/providers/tenant-provider";
import { updateCompanyAction, leaveCompanyAction } from "@/server/actions/tenant";
import { updateAvatarAction, updateProfileAction } from "@/server/actions/user";
import { AVATAR_ALLOWED_TYPES, AVATAR_MAX_BYTES } from "@/services/userService";

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

export function AvatarForm({
  initialAvatarUrl,
  userName,
}: {
  initialAvatarUrl: string | null;
  userName: string;
}) {
  const [state, formAction, pending] = useActionState(updateAvatarAction, undefined);
  const [clientError, setClientError] = useState<string>();
  const initials = userName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Feedback imediato no client; a validação de verdade repete no server.
  function validateOnClient(file: File | undefined) {
    if (!file) return;
    if (!AVATAR_ALLOWED_TYPES[file.type]) {
      setClientError("Formato inválido: use JPG, PNG ou WebP");
    } else if (file.size > AVATAR_MAX_BYTES) {
      setClientError("A imagem deve ter no máximo 2MB");
    } else {
      setClientError(undefined);
    }
  }

  const error = clientError ?? state?.error;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.success && !clientError ? (
        <Alert>
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex items-center gap-4">
        <Avatar className="size-14">
          {initialAvatarUrl ? <AvatarImage src={initialAvatarUrl} alt={userName} /> : null}
          <AvatarFallback>{initials || "?"}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <Label htmlFor="avatar">Foto de perfil (JPG, PNG ou WebP, até 2MB)</Label>
          <Input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => validateOnClient(e.target.files?.[0])}
            required
          />
        </div>
      </div>
      <Button type="submit" disabled={pending || Boolean(clientError)} className="w-fit">
        {pending ? "Enviando..." : "Salvar foto"}
      </Button>
    </form>
  );
}

export function LeaveCompanyButton() {
  const { active } = useTenant();
  const [pending, startTransition] = useTransition();

  function leave() {
    startTransition(async () => {
      try {
        const result = await leaveCompanyAction(active.id);
        if (result?.error) toast.error(result.error);
        // sucesso redireciona no servidor — nada a fazer aqui
      } catch {
        toast.error("Não foi possível sair da empresa. Tente novamente.");
      }
    });
  }

  return (
    <Button variant="destructive" disabled={pending} onClick={leave}>
      {pending ? "Saindo..." : `Sair de ${active.name}`}
    </Button>
  );
}
