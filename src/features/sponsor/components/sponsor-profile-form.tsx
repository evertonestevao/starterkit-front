"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestProfileChangeAction } from "@/server/actions/sponsorProfile";

/**
 * Edição do perfil do patrocinador.
 *
 * O nome não é salvo na hora: ele aparece nas páginas públicas das igrejas,
 * então vira pedido e só entra no ar depois da conferência da plataforma. O
 * telefone, que não aparece em lugar nenhum, salva direto. O formulário diz
 * isso em cada campo — descobrir depois que "salvou" não mudou nada seria
 * pior do que esperar sabendo.
 */
export function SponsorProfileForm({
  displayName,
  phone,
  bloqueada,
}: {
  displayName: string;
  phone: string | null;
  bloqueada: boolean;
}) {
  const [state, formAction, pending] = useActionState(requestProfileChangeAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
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
        <Label htmlFor="displayName">Nome exibido</Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          minLength={2}
          maxLength={120}
          required
          disabled={bloqueada}
        />
        <p className="text-xs text-muted-foreground">
          É o nome que aparece nas páginas das igrejas que você apoia. Mudanças passam pela
          conferência da nossa equipe antes de entrar no ar.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Celular</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={phone ?? ""}
          placeholder="(11) 90000-0000"
        />
        <p className="text-xs text-muted-foreground">
          Usado só para falarmos com você. Não aparece para as igrejas, e salva na hora.
        </p>
      </div>

      <div className="flex">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
