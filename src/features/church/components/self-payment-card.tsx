"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { Building2, HandCoins, ShieldCheck, User } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToastedAction } from "@/hooks/useToastedAction";
import { formatDocumentFor } from "@/lib/brDocument";
import { cn } from "@/lib/utils";
import { formatCents } from "@/services/sponsorPricing";
import type { ChurchSelfPaymentStatus } from "@/services/churchSelfPaymentService";
import {
  enableChurchSelfPaymentAction,
  setChurchAceitaPatrocinioAction,
} from "@/server/actions/churchSelfPayment";
import type { SponsorKind } from "@/types/sponsorship";

const KIND_OPTIONS: Array<{ value: SponsorKind; label: string; icon: typeof User }> = [
  { value: "person", label: "Pessoa (CPF)", icon: User },
  { value: "business", label: "Empresa (CNPJ)", icon: Building2 },
];

/** Botão "abrir/fechar a porta pra patrocinador", com o mesmo padrão de toast dos outros. */
function AceitaPatrocinioToggle({ churchId, aceita }: { churchId: string; aceita: boolean }) {
  const [formAction, pending] = useToastedAction(setChurchAceitaPatrocinioAction);
  return (
    <form action={formAction}>
      <input type="hidden" name="churchId" value={churchId} />
      <input type="hidden" name="aceita" value={String(!aceita)} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {aceita ? "Fechar a porta pra patrocinador" : "Voltar a aceitar patrocinador"}
      </Button>
    </form>
  );
}

/** Formulário de dados de cobrança (CPF/CNPJ, email, telefone), reaberto sob demanda. */
function EnableForm({ churchId, defaultEmail }: { churchId: string; defaultEmail: string }) {
  const [state, formAction, pending] = useActionState(enableChurchSelfPaymentAction, undefined);
  const [kind, setKind] = useState<SponsorKind>("person");
  const [documentValue, setDocumentValue] = useState("");
  const [submitting, startTransition] = useTransition();
  const isBusiness = kind === "business";

  // Mesmo motivo do cadastro do patrocinador: React 19 reseta o form ao
  // terminar a action, apagando tudo se o servidor recusar (documento
  // inválido). Envia numa transition pra evitar isso.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => formAction(new FormData(event.currentTarget)));
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="churchId" value={churchId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Cadastro para a cobrança</legend>
        <div className="grid grid-cols-2 gap-2">
          {KIND_OPTIONS.map(({ value, label, icon: Icon }) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
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
                  setDocumentValue((current) => formatDocumentFor(value, current));
                }}
                className="sr-only"
              />
              <Icon className="size-4 text-primary" aria-hidden />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sp-displayName">{isBusiness ? "Nome da igreja/empresa" : "Nome do responsável"}</Label>
          <Input id="sp-displayName" name="displayName" minLength={2} maxLength={120} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sp-document">{isBusiness ? "CNPJ" : "CPF"}</Label>
          <Input
            id="sp-document"
            name="document"
            inputMode="numeric"
            autoComplete="off"
            value={documentValue}
            onChange={(e) => setDocumentValue(formatDocumentFor(kind, e.target.value))}
            maxLength={isBusiness ? 18 : 14}
            placeholder={isBusiness ? "00.000.000/0000-00" : "000.000.000-00"}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sp-email">Email de cobrança</Label>
          <Input id="sp-email" name="email" type="email" defaultValue={defaultEmail} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sp-phone">Celular (opcional)</Label>
          <Input id="sp-phone" name="phone" type="tel" inputMode="tel" placeholder="(11) 90000-0000" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Exigido pelo meio de pagamento para emitir a cobrança. Some da tela depois de salvo.
      </p>

      <Button type="submit" disabled={pending || submitting} className="w-fit">
        {pending || submitting ? "Salvando..." : "Assumir a mensalidade"}
      </Button>
    </form>
  );
}

/**
 * Autopatrocínio: sem nenhum patrocinador de verdade, a própria igreja pode
 * assumir a mensalidade dela (valor fixo, cobrado como um patrocínio). Some
 * da tela assim que qualquer patrocinador de verdade aparece — o banco
 * cancela sozinho, no fim do ciclo já pago.
 */
export function SelfPaymentCard({
  churchId,
  churchName,
  status,
  defaultEmail,
}: {
  churchId: string;
  churchName: string;
  status: ChurchSelfPaymentStatus;
  defaultEmail: string;
}) {
  const [abrirForm, setAbrirForm] = useState(false);
  const billable = status.sponsorshipStatus === "pending_payment" || status.sponsorshipStatus === "active";

  if (status.realSponsorCount > 0) return null;

  if (billable) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            Você está pagando a mensalidade de {churchName}
          </CardTitle>
          <CardDescription>
            {formatCents(status.amountCents)}/mês, cobrado no mesmo sistema do patrocínio. Se um
            patrocinador de verdade entrar, essa cobrança para sozinha, sem cortar no meio do ciclo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AceitaPatrocinioToggle churchId={churchId} aceita={status.aceitaPatrocinio} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HandCoins className="size-4 text-primary" aria-hidden />
          {churchName} está sem patrocinador
        </CardTitle>
        <CardDescription>
          Enquanto isso, você pode assumir a mensalidade — {formatCents(status.amountCents)}/mês — para a
          página continuar no ar. Assim que aparecer um patrocinador de verdade, essa cobrança para
          sozinha.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {abrirForm ? (
          <EnableForm churchId={churchId} defaultEmail={defaultEmail} />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setAbrirForm(true)}>
              Assumir a mensalidade
            </Button>
            <AceitaPatrocinioToggle churchId={churchId} aceita={status.aceitaPatrocinio} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
