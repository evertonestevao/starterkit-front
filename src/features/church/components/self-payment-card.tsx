"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Building2, CircleCheck, Clock, CreditCard, HeartHandshake, User } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TelefoneInput } from "@/components/telefone-input";
import { useToastedAction } from "@/hooks/useToastedAction";
import { formatDocumentFor } from "@/lib/brDocument";
import { cn } from "@/lib/utils";
import { formatCents } from "@/services/sponsorPricing";
import type { ChurchSelfPaymentStatus } from "@/services/churchSelfPaymentService";
import { enableChurchSelfPaymentAction, setChurchAceitaPatrocinioAction } from "@/server/actions/churchSelfPayment";
import type { SponsorKind } from "@/types/sponsorship";

const KIND_OPTIONS: Array<{ value: SponsorKind; label: string; icon: typeof User }> = [
  { value: "person", label: "Pessoa (CPF)", icon: User },
  { value: "business", label: "Igreja ou empresa (CNPJ)", icon: Building2 },
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

/** Dados de quem paga (CPF/CNPJ, e-mail, telefone), exigidos pelo meio de pagamento. */
function EnableForm({ churchId, defaultEmail }: { churchId: string; defaultEmail: string }) {
  const [state, formAction, pending] = useActionState(enableChurchSelfPaymentAction, undefined);
  const [kind, setKind] = useState<SponsorKind>("business");
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
        <legend className="mb-1 text-sm font-medium">Quem paga</legend>
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
          <Label htmlFor="sp-displayName">{isBusiness ? "Nome da igreja ou empresa" : "Nome do responsável"}</Label>
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
          <TelefoneInput id="sp-phone" name="phone" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Estes dados são exigidos pelo meio de pagamento para emitir a cobrança. No próximo passo você informa o cartão,
        na página segura do meio de pagamento — o sistema da igreja não vê nem guarda o número do cartão.
      </p>

      <Button type="submit" disabled={pending || submitting} className="w-fit gap-2">
        <CreditCard className="size-4" aria-hidden />
        {pending || submitting ? "Abrindo o pagamento..." : "Continuar para o cartão"}
      </Button>
    </form>
  );
}

/**
 * Mensalidade da igreja: quanto ela paga por mês para usar a plataforma, e o
 * cadastro de quem paga. O valor vem da plataforma (o padrão, ou o que foi
 * combinado com esta igreja) — a igreja não o altera.
 *
 * Por baixo é a mesma cobrança recorrente do patrocínio: se um patrocinador
 * assumir a igreja, a mensalidade para sozinha no fim do ciclo já pago.
 */
export function MensalidadeCard({
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
  const valor = `${formatCents(status.amountCents)} por mês`;

  if (status.realSponsorCount > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartHandshake className="size-4 text-primary" aria-hidden />
            Mensalidade de {churchName}: coberta por patrocinador
          </CardTitle>
          <CardDescription>
            Enquanto houver patrocinador ativo, a igreja não paga nada. Veja quem apoia em{" "}
            <Link href="/dashboard/sponsors" className="font-medium text-primary underline underline-offset-4">
              Patrocinadores
            </Link>
            .
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status.sponsorshipStatus === "active" || status.sponsorshipStatus === "pending_payment") {
    const emDia = status.sponsorshipStatus === "active";
    const Icone = emDia ? CircleCheck : Clock;
    return (
      <Card className={emDia ? "border-primary/30 bg-primary/5" : "border-amber-500/40 bg-amber-500/10"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icone className={cn("size-4", emDia ? "text-primary" : "text-amber-600")} aria-hidden />
            Mensalidade de {churchName}: {emDia ? "em dia" : "aguardando o pagamento"}
          </CardTitle>
          <CardDescription>
            {valor}, no cartão de crédito.{" "}
            {emDia
              ? "A cobrança é feita todo mês no cartão cadastrado, e o recibo chega no e-mail de cobrança."
              : "Falta informar o cartão. Assim que o pagamento for aprovado, isto muda para “em dia”."}
            {status.account?.email ? ` E-mail de cobrança: ${status.account.email}.` : ""}
          </CardDescription>
        </CardHeader>
        {!emDia ? (
          <CardContent>
            {status.openInvoiceUrl ? (
              <a
                href={status.openInvoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants(), "gap-2")}
              >
                <CreditCard className="size-4" aria-hidden /> Pagar com cartão
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">
                O link para pagar com cartão foi enviado ao e-mail de cobrança.
              </p>
            )}
          </CardContent>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="size-4 text-primary" aria-hidden />
          Mensalidade de {churchName}
        </CardTitle>
        <CardDescription>
          <span className="text-lg font-semibold text-foreground">{valor}</span>
          <span className="block">
            É o que mantém o sistema e a página da igreja no ar. O pagamento é no cartão de crédito, cobrado todo mês.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {abrirForm ? (
          <EnableForm churchId={churchId} defaultEmail={defaultEmail} />
        ) : (
          <Button type="button" className="gap-2" onClick={() => setAbrirForm(true)}>
            <CreditCard className="size-4" aria-hidden /> Pagar com cartão
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Em Patrocinadores, para a igreja sem patrocinador: decidir se ela aparece
 * para quem quer patrocinar. A mensalidade em si fica na tela própria.
 */
export function PortaPatrocinadorCard({
  churchId,
  churchName,
  status,
}: {
  churchId: string;
  churchName: string;
  status: ChurchSelfPaymentStatus;
}) {
  if (status.realSponsorCount > 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{churchName} está sem patrocinador</CardTitle>
        <CardDescription>
          Sem patrocinador, quem paga a mensalidade é a própria igreja — veja em{" "}
          <Link href="/dashboard/mensalidade" className="font-medium text-primary underline underline-offset-4">
            Mensalidade
          </Link>
          . Se um patrocinador entrar, essa cobrança para sozinha. Se a igreja não quer patrocinador, feche a porta: o
          espaço deles some da página.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AceitaPatrocinioToggle churchId={churchId} aceita={status.aceitaPatrocinio} />
      </CardContent>
    </Card>
  );
}
