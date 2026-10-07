"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, CircleCheck, Clock, Copy, CreditCard, HeartHandshake, QrCode, User } from "lucide-react";
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
import {
  enableChurchSelfPaymentAction,
  retomarMensalidadeAction,
  setChurchAceitaPatrocinioAction,
  type PixNaTela,
} from "@/server/actions/churchSelfPayment";
import type { PaymentMethod, SponsorKind } from "@/types/sponsorship";

const KIND_OPTIONS: Array<{ value: SponsorKind; label: string; icon: typeof User }> = [
  { value: "person", label: "Pessoa (CPF)", icon: User },
  { value: "business", label: "Igreja ou empresa (CNPJ)", icon: Building2 },
];

const FORMAS: Array<{ value: PaymentMethod; label: string; descricao: string; icon: typeof User }> = [
  {
    value: "card",
    label: "Cartão de crédito",
    descricao: "Informe o cartão uma vez; a cobrança é feita nele todo mês.",
    icon: CreditCard,
  },
  {
    value: "pix_automatico",
    label: "Pix Automático",
    descricao: "Autorize uma vez no aplicativo do banco; o débito é feito todo mês.",
    icon: QrCode,
  },
];

const FORMA_LABEL: Record<PaymentMethod, string> = {
  card: "no cartão de crédito",
  pix_automatico: "por Pix Automático",
};

const opcao = (ativo: boolean) =>
  cn(
    "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
    ativo ? "border-primary bg-primary/5" : "hover:bg-muted",
  );

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

/** Escolha entre cartão e Pix Automático. Sem Pix no provedor, não há o que escolher: é cartão. */
function EscolhaDaForma({
  forma,
  onMudar,
  pixDisponivel,
}: {
  forma: PaymentMethod;
  onMudar: (forma: PaymentMethod) => void;
  pixDisponivel: boolean;
}) {
  if (!pixDisponivel) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Forma de pagamento</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {FORMAS.map(({ value, label, descricao, icon: Icon }) => (
          <label key={value} className={opcao(forma === value)}>
            <input
              type="radio"
              name="method"
              value={value}
              checked={forma === value}
              onChange={() => onMudar(value)}
              className="sr-only"
            />
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{descricao}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * O QR Code do Pix Automático: lido no aplicativo do banco, paga a primeira
 * mensalidade e autoriza as seguintes. A confirmação chega do provedor; o
 * botão só recarrega a tela para mostrar o estado novo.
 */
function PixParaAutorizar({ pix, valor }: { pix: PixNaTela; valor: string }) {
  const router = useRouter();
  async function copiar() {
    try {
      await navigator.clipboard.writeText(pix.payload);
      toast.success("Código copiado. Cole no Pix do aplicativo do banco.");
    } catch {
      toast.message("Copie o código:", { description: pix.payload, duration: Infinity, closeButton: true });
    }
  }
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {/* Imagem gerada no servidor (data URL), a partir do código devolvido pelo provedor. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pix.qrDataUrl}
        alt="QR Code para autorizar o Pix Automático"
        className="size-48 shrink-0 rounded-lg border bg-white p-2"
      />
      <div className="flex min-w-0 flex-col gap-3 text-sm">
        <ol className="list-decimal space-y-1 pl-4">
          <li>Abra o aplicativo do banco da igreja e escolha pagar com Pix.</li>
          <li>Leia este QR Code (ou use o código abaixo).</li>
          <li>
            Confirme o pagamento de <strong>{valor}</strong> e a autorização dos débitos seguintes.
          </li>
        </ol>
        <p className="rounded-md border bg-muted/40 p-2 font-mono text-xs break-all" aria-label="Pix copia e cola">
          {pix.payload}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copiar}>
            <Copy className="size-3.5" /> Copiar código
          </Button>
          <Button type="button" size="sm" onClick={() => router.refresh()}>
            Já autorizei
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {pix.expiresAt
            ? `Este código vale até ${new Date(pix.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. `
            : ""}
          A confirmação pode levar alguns instantes. Se o banco da igreja não aceitar Pix Automático nesta conta, use o
          cartão.
        </p>
      </div>
    </div>
  );
}

/** Dados de quem paga (CPF/CNPJ, e-mail, telefone), exigidos pelo meio de pagamento, e a forma. */
function EnableForm({
  churchId,
  defaultEmail,
  pixDisponivel,
  onPix,
}: {
  churchId: string;
  defaultEmail: string;
  pixDisponivel: boolean;
  /** O QR Code sobe para o cartão: ao salvar, este formulário sai da tela. */
  onPix: (pix: PixNaTela) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [kind, setKind] = useState<SponsorKind>("business");
  const [forma, setForma] = useState<PaymentMethod>("card");
  const [documentValue, setDocumentValue] = useState("");
  const [submitting, startTransition] = useTransition();
  const isBusiness = kind === "business";

  // A action é chamada direto (e não por useActionState) por dois motivos: o
  // React 19 resetaria o form ao terminar, apagando tudo se o servidor
  // recusar; e, ao dar certo, a página troca o estado da mensalidade e este
  // formulário é desmontado — o resultado precisa ir para quem continua na tela.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dados = new FormData(event.currentTarget);
    startTransition(async () => {
      const r = await enableChurchSelfPaymentAction(undefined, dados);
      if (r?.error) setErro(r.error);
      else if (r?.pix) onPix(r.pix);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {erro ? (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="churchId" value={churchId} />

      <EscolhaDaForma forma={forma} onMudar={setForma} pixDisponivel={pixDisponivel} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Quem paga</legend>
        <div className="grid grid-cols-2 gap-2">
          {KIND_OPTIONS.map(({ value, label, icon: Icon }) => (
            <label key={value} className={cn(opcao(kind === value), "items-center")}>
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
        Estes dados são exigidos pelo meio de pagamento para emitir a cobrança.{" "}
        {forma === "card"
          ? "No próximo passo você informa o cartão, na página segura do meio de pagamento — o sistema da igreja não vê nem guarda o número do cartão."
          : "No próximo passo aparece o QR Code para você autorizar no aplicativo do banco."}
      </p>

      <Button type="submit" disabled={submitting} className="w-fit gap-2">
        {forma === "card" ? <CreditCard className="size-4" aria-hidden /> : <QrCode className="size-4" aria-hidden />}
        {submitting ? "Abrindo o pagamento..." : forma === "card" ? "Continuar para o cartão" : "Gerar QR Code do Pix"}
      </Button>
    </form>
  );
}

/**
 * Concluir um pagamento que ficou no meio: escolhe a forma (de novo) e segue
 * para o cartão ou para o QR Code. Quem paga já está cadastrado.
 */
function Retomar({
  churchId,
  formaInicial,
  pixDisponivel,
  podeTrocarForma,
  onPix,
}: {
  churchId: string;
  formaInicial: PaymentMethod;
  pixDisponivel: boolean;
  /** Sem cobrança viva no provedor, dá para escolher a outra forma. */
  podeTrocarForma: boolean;
  onPix: (pix: PixNaTela) => void;
}) {
  const [forma, setForma] = useState<PaymentMethod>(pixDisponivel ? formaInicial : "card");
  const [pending, start] = useTransition();

  function retomar() {
    start(async () => {
      const r = await retomarMensalidadeAction(churchId, forma);
      if (r?.error) toast.error(r.error);
      else if (r?.pix) onPix(r.pix);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {podeTrocarForma ? <EscolhaDaForma forma={forma} onMudar={setForma} pixDisponivel={pixDisponivel} /> : null}
      <Button type="button" className="w-fit gap-2" disabled={pending} onClick={retomar}>
        {forma === "card" ? <CreditCard className="size-4" aria-hidden /> : <QrCode className="size-4" aria-hidden />}
        {pending ? "Abrindo o pagamento..." : forma === "card" ? "Pagar com cartão" : "Gerar QR Code do Pix"}
      </Button>
    </div>
  );
}

/**
 * Mensalidade da igreja: quanto ela paga por mês para usar a plataforma, em
 * que pé está, e o cadastro de quem paga — no cartão ou por Pix Automático,
 * as duas formas que cobram sozinhas depois da primeira vez. O valor vem da
 * plataforma (o padrão, ou o que foi combinado com esta igreja); a igreja não
 * o altera.
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
  // O QR Code fica guardado AQUI: gerar o Pix muda o estado da mensalidade, a
  // página recarrega os dados e os formulários abaixo são trocados — este
  // cartão é o que continua na tela.
  const [pix, setPix] = useState<PixNaTela | null>(null);
  const valor = `${formatCents(status.amountCents)} por mês`;
  const contratada = status.sponsorshipStatus === "active" || status.sponsorshipStatus === "pending_payment";
  // Com a cobrança paga, o QR Code não tem mais o que fazer na tela.
  const mostrarPix = pix !== null && status.sponsorshipStatus !== "active" && status.realSponsorCount === 0;

  if (mostrarPix && pix) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="size-4 text-amber-600" aria-hidden />
            Mensalidade de {churchName}: autorize o Pix Automático
          </CardTitle>
          <CardDescription>
            {valor}. Este QR Code paga a primeira mensalidade e autoriza as seguintes: depois dele, o débito é feito
            sozinho todo mês.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PixParaAutorizar pix={pix} valor={valor} />
        </CardContent>
      </Card>
    );
  }

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

  // Contratada, mas sem cobrança recorrente no provedor: falta concluir, ou o
  // valor mudou e o Pix precisa de uma autorização nova.
  if (contratada && status.needsAuthorization) {
    const valorMudou = status.sponsorshipStatus === "active";
    return (
      <Card className="border-amber-500/40 bg-amber-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-amber-600" aria-hidden />
            Mensalidade de {churchName}: {valorMudou ? "autorize de novo" : "falta concluir o pagamento"}
          </CardTitle>
          <CardDescription>
            {valorMudou
              ? `O valor da mensalidade mudou para ${valor}. Como o débito automático era de um valor fixo, é preciso autorizar de novo.`
              : `${valor}. Escolha como pagar para a cobrança começar.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Retomar
            churchId={churchId}
            formaInicial={status.paymentMethod}
            pixDisponivel={status.pixDisponivel}
            podeTrocarForma
            onPix={setPix}
          />
        </CardContent>
      </Card>
    );
  }

  if (contratada) {
    const emDia = status.sponsorshipStatus === "active";
    const Icone = emDia ? CircleCheck : Clock;
    const porPix = status.paymentMethod === "pix_automatico";
    return (
      <Card className={emDia ? "border-primary/30 bg-primary/5" : "border-amber-500/40 bg-amber-500/10"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icone className={cn("size-4", emDia ? "text-primary" : "text-amber-600")} aria-hidden />
            Mensalidade de {churchName}: {emDia ? "em dia" : "aguardando o pagamento"}
          </CardTitle>
          <CardDescription>
            {valor}, {FORMA_LABEL[status.paymentMethod]}.{" "}
            {emDia
              ? porPix
                ? "O débito é feito todo mês na conta autorizada, e o recibo chega no e-mail de cobrança."
                : "A cobrança é feita todo mês no cartão cadastrado, e o recibo chega no e-mail de cobrança."
              : porPix
                ? "Falta autorizar no aplicativo do banco. Assim que o pagamento for confirmado, isto muda para “em dia”."
                : "Falta informar o cartão. Assim que o pagamento for aprovado, isto muda para “em dia”."}
            {status.account?.email ? ` E-mail de cobrança: ${status.account.email}.` : ""}
          </CardDescription>
        </CardHeader>
        {!emDia ? (
          <CardContent>
            {porPix ? (
              // O QR Code vence: aqui se gera outro (o anterior deixa de valer).
              <Retomar
                churchId={churchId}
                formaInicial="pix_automatico"
                pixDisponivel={status.pixDisponivel}
                podeTrocarForma={false}
                onPix={setPix}
              />
            ) : status.openInvoiceUrl ? (
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
            É o que mantém o sistema e a página da igreja no ar.{" "}
            {status.pixDisponivel
              ? "O pagamento é automático, no cartão de crédito ou por Pix Automático: você configura uma vez e a cobrança é feita todo mês."
              : "O pagamento é no cartão de crédito, cobrado todo mês."}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {abrirForm ? (
          <EnableForm
            churchId={churchId}
            defaultEmail={defaultEmail}
            pixDisponivel={status.pixDisponivel}
            onPix={setPix}
          />
        ) : (
          <Button type="button" className="gap-2" onClick={() => setAbrirForm(true)}>
            <CreditCard className="size-4" aria-hidden />{" "}
            {status.pixDisponivel ? "Cadastrar pagamento" : "Pagar com cartão"}
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
