"use client";

import { useActionToast } from "@/hooks/useActionToast";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TelefoneInput } from "@/components/telefone-input";
import { TermsCheckboxes } from "@/features/terms/components/terms-checkboxes";
import { DEFAULT_SPONSOR_KIND, SPONSOR_KIND_OPTIONS } from "@/features/sponsor/sponsorKindOptions";
import { cn } from "@/lib/utils";
import { startPublicSponsorshipAction } from "@/server/actions/sponsor";
import type { SponsorKind } from "@/types/sponsorship";

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
  useActionToast(state);
  const [kind, setKind] = useState<SponsorKind>(
    (state?.values?.kind as SponsorKind) || DEFAULT_SPONSOR_KIND,
  );
  const isBusiness = kind === "business";

  return (
    <form action={formAction} className="flex flex-col gap-5">

      <input type="hidden" name="churchPublicCode" value={churchPublicCode} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Quem vai patrocinar?</legend>
        <div className="grid grid-cols-2 gap-3">
          {SPONSOR_KIND_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
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
        <Input
          id="displayName"
          name="displayName"
          minLength={2}
          maxLength={120}
          defaultValue={state?.values?.displayName}
          required
        />
        <p className="text-xs text-muted-foreground">
          É o nome que vai aparecer na página da igreja que você apoia — não precisa ser igual ao
          do CPF/CNPJ.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="visibleOnPage"
          defaultChecked={
            state?.values ? state.values.visibleOnPage === "on" : true
          }
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          Aparecer na página da igreja
          <span className="block text-xs text-muted-foreground">
            Desmarcado, seu patrocínio vale do mesmo jeito — só não aparece na vitrine pública.
            Você pode mudar isso depois, no seu painel.
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state?.values?.email}
          required
        />
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
          defaultValue={state?.values?.document}
          required
        />
        <p className="text-xs text-muted-foreground">
          Exigido pelo meio de pagamento. Não aparece para a igreja.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Celular (opcional)</Label>
        <TelefoneInput id="phone" name="phone" defaultValue={state?.values?.phone} />
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
