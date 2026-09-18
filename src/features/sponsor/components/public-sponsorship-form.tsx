"use client";

import { useActionState, useState } from "react";
import { Building2, User } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TermsCheckboxes } from "@/features/terms/components/terms-checkboxes";
import { cn } from "@/lib/utils";
import { startPublicSponsorshipAction } from "@/server/actions/sponsor";
import type { SponsorKind } from "@/types/sponsorship";

const KIND_OPTIONS: Array<{ value: SponsorKind; label: string; hint: string; icon: typeof User }> = [
  { value: "person", label: "Pessoa", hint: "Apoio em meu nome, com CPF", icon: User },
  { value: "business", label: "Empresa", hint: "Apoio de um negócio, com CNPJ", icon: Building2 },
];

/**
 * Formulário do patrocinador novo, na página pública. Pede o mínimo que o
 * meio de pagamento exige para emitir a cobrança — nome, email e CPF/CNPJ.
 * Não há senha: o acesso ao painel chega por link no email.
 */
export function PublicSponsorshipForm({
  churchPublicCode,
  priceLabel,
}: {
  churchPublicCode: string;
  priceLabel: string;
}) {
  const [state, formAction, pending] = useActionState(startPublicSponsorshipAction, undefined);
  const [kind, setKind] = useState<SponsorKind>("person");
  const isBusiness = kind === "business";

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

      <input type="hidden" name="churchPublicCode" value={churchPublicCode} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Quem vai patrocinar?</legend>
        <div className="grid grid-cols-2 gap-3">
          {KIND_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors",
                kind === value ? "border-primary bg-primary/5" : "hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="sr-only"
              />
              <span className="flex items-center gap-2 font-medium">
                <Icon className="size-4 text-primary" aria-hidden />
                {label}
              </span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">{isBusiness ? "Nome do negócio" : "Seu nome"}</Label>
        <Input id="displayName" name="displayName" minLength={2} maxLength={120} required />
        <p className="text-xs text-muted-foreground">
          É o nome que aparece na página da igreja.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        <p className="text-xs text-muted-foreground">
          Para onde vão a fatura e o link de acesso ao seu painel.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="document">{isBusiness ? "CNPJ" : "CPF"}</Label>
        <Input
          id="document"
          name="document"
          inputMode="numeric"
          autoComplete="off"
          placeholder={isBusiness ? "00.000.000/0000-00" : "000.000.000-00"}
          required
        />
        <p className="text-xs text-muted-foreground">
          Exigido pelo meio de pagamento. Não aparece para a igreja.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Celular (opcional)</Label>
        <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" />
      </div>

      <TermsCheckboxes audience="patrocinador" />

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Aguarde..." : `Assinar patrocínio — ${priceLabel}/mês`}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Cobrança mensal no cartão, sem parcelamento. Você pode cancelar quando quiser.
      </p>
    </form>
  );
}
