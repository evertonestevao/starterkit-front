"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TelefoneInput } from "@/components/telefone-input";
import { TermsCheckboxes } from "@/features/terms/components/terms-checkboxes";
import { DEFAULT_SPONSOR_KIND, SPONSOR_KIND_OPTIONS } from "@/features/sponsor/sponsorKindOptions";
import { formatDocumentFor } from "@/lib/brDocument";
import { cn } from "@/lib/utils";
import { createSponsorAccountAction } from "@/server/actions/sponsor";
import type { SponsorKind } from "@/types/sponsorship";

export function SponsorAccountForm({
  next,
  defaultName,
  needsTerms,
}: {
  next: string;
  defaultName: string;
  needsTerms: boolean;
}) {
  const [state, formAction, pending] = useActionState(createSponsorAccountAction, undefined);
  const [kind, setKind] = useState<SponsorKind>(DEFAULT_SPONSOR_KIND);
  const [documentValue, setDocumentValue] = useState("");
  const [submitting, startTransition] = useTransition();
  const isBusiness = kind === "business";

  // O React 19 dá form.reset() quando um <form action> termina, apagando tudo o
  // que a pessoa digitou — inclusive quando o servidor recusa (CPF/CNPJ
  // inválido). Enviar o FormData numa transition evita o reset. O `action` fica
  // no <form> só para o envio antes da hidratação; depois dela o React ignora
  // o submit já cancelado aqui.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-5">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="next" value={next} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Quem vai patrocinar?</legend>
        <div className="grid grid-cols-2 gap-3">
          {SPONSOR_KIND_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                kind === value ? "border-primary bg-primary/5" : "hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => {
                  setKind(value);
                  // CPF e CNPJ têm máscaras diferentes: reaplica sobre o que já foi digitado.
                  setDocumentValue((current) => formatDocumentFor(value, current));
                }}
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
        <Label htmlFor="displayName">
          {isBusiness ? "Nome do negócio" : "Seu nome"}
        </Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={isBusiness ? "" : defaultName}
          key={kind}
          minLength={2}
          maxLength={120}
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
          defaultChecked
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
        <Label htmlFor="document">{isBusiness ? "CNPJ" : "CPF"}</Label>
        <Input
          id="document"
          name="document"
          inputMode="numeric"
          autoComplete="off"
          value={documentValue}
          onChange={(event) => setDocumentValue(formatDocumentFor(kind, event.target.value))}
          maxLength={isBusiness ? 18 : 14}
          placeholder={isBusiness ? "00.000.000/0000-00" : "000.000.000-00"}
          required
        />
        <p className="text-xs text-muted-foreground">
          Exigido pelo meio de pagamento para emitir a cobrança. Não aparece para a igreja.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Celular (opcional)</Label>
        <TelefoneInput id="phone" name="phone" />
      </div>

      {needsTerms ? <TermsCheckboxes audience="patrocinador" /> : null}

      <Button type="submit" disabled={pending || submitting} className="w-full">
        {pending || submitting ? "Salvando..." : "Concluir cadastro"}
      </Button>
    </form>
  );
}
