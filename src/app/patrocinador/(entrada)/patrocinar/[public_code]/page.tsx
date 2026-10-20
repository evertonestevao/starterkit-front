import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, HandHeart, Info, MapPin } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSponsorshipForm } from "@/features/sponsor/components/confirm-sponsorship-form";
import { SponsorshipDisclosure } from "@/features/sponsor/components/sponsorship-disclosure";
import { isAppError } from "@/lib/errors";
import { sponsorshipPath } from "@/lib/sponsorPaths";
import { cn } from "@/lib/utils";
import { getPublicSponsorService, getSponsorService } from "@/server/sponsor";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { formatCents } from "@/services/sponsorPricing";

export const metadata: Metadata = { title: "Patrocinar igreja" };

/**
 * Convite de patrocínio — o link que o pastor divulga. É PÚBLICO: quem chega
 * decidido a ajudar não deve bater numa tela de login.
 *
 * Três estados, decididos aqui:
 *  - sem sessão: convite + preço de entrada + dois caminhos (novo / já sou);
 *  - logado com cadastro: confirmação com o valor exato dele;
 *  - logado sem cadastro (ex.: pastor): completa o cadastro curto antes.
 */
export default async function SponsorshipInvitePage({
  params,
}: {
  params: Promise<{ public_code: string }>;
}) {
  const { public_code } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return <PublicInvite publicCode={public_code} />;
  }

  const service = await getSponsorService();
  if (!(await service.getMyAccount())) {
    redirect(`/patrocinador/cadastro?next=${encodeURIComponent(sponsorshipPath(public_code))}`);
  }

  let preview;
  try {
    preview = await service.previewSponsorship(public_code);
  } catch (err) {
    if (isAppError(err) && err.code === "not_found") notFound();
    throw err;
  }
  const { church } = preview;

  if (preview.alreadySponsoring) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-primary" aria-hidden />
            Você já apoia {church.name}
          </CardTitle>
          <CardDescription>Obrigado por caminhar junto com essa comunidade.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/patrocinador/patrocinios"
            className={cn(buttonVariants(), "w-full")}
          >
            Ver meus patrocínios
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>Você está prestes a apoiar</CardDescription>
        <CardTitle className="text-2xl">{church.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {preview.blockedByOverdue ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Há um pagamento em aberto na sua conta. Regularize-o em{" "}
              <Link href="/patrocinador/pagamentos" className="underline underline-offset-4">
                Pagamentos
              </Link>{" "}
              para apoiar outra igreja.
            </AlertDescription>
          </Alert>
        ) : null}

        <dl className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
          {preview.currentCount > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                Hoje ({preview.currentCount} {preview.currentCount === 1 ? "igreja" : "igrejas"})
              </dt>
              <dd className="tabular-nums">{formatCents(preview.currentTotalCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              {preview.currentCount === 0
                ? "Apoio mensal"
                : `Acréscimo pela ${preview.currentCount + 1}ª igreja`}
            </dt>
            <dd className="tabular-nums">+ {formatCents(preview.addedCents)}</dd>
          </div>
          <div className="mt-1 flex justify-between gap-4 border-t pt-3 font-semibold">
            <dt>Total mensal</dt>
            <dd className="tabular-nums">{formatCents(preview.newTotalCents)}</dd>
          </div>
        </dl>

        <SponsorshipDisclosure churchName={church.name} churchPublicCode={church.publicCode} />

        <p className="flex gap-2 text-xs leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {preview.chargesNow
            ? "Você será levado à página segura do meio de pagamento para informar o cartão. A cobrança é mensal, no cartão de crédito, sem parcelamento — e você pode cancelar quando quiser."
            : "A igreja passa a exibir seu apoio agora. O novo total entra na sua próxima fatura, que continua sendo uma só."}
        </p>

        {preview.blockedByOverdue ? null : (
          <ConfirmSponsorshipForm
            churchId={church.id}
            submitLabel={preview.chargesNow ? "Continuar para o pagamento" : "Confirmar patrocínio"}
          />
        )}

        <Link
          href="/patrocinador"
          className="text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Agora não
        </Link>
      </CardContent>
    </Card>
  );
}

/** Visitante sem sessão: convite, preço de entrada e os dois caminhos. */
async function PublicInvite({ publicCode }: { publicCode: string }) {
  let invite;
  try {
    invite = await getPublicSponsorService().getInviteData(publicCode);
  } catch (err) {
    if (isAppError(err) && err.code === "not_found") notFound();
    throw err;
  }

  const { church, tiers, entryPriceCents } = invite;
  const lastTier = tiers[tiers.length - 1];
  const backHere = sponsorshipPath(publicCode);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <HandHeart className="size-4 text-primary" aria-hidden />
            Convite para patrocinar
          </CardDescription>
          {/* h1 de verdade: esta página é ponto de entrada de um link
              compartilhado, sem cabeçalho de app em volta. `CardTitle` é uma
              `div`, e a página ficava sem título nenhum na árvore de
              acessibilidade. */}
          <h1 data-slot="card-title" className="font-heading text-2xl leading-snug font-medium">
            {church.name}
          </h1>
          {church.address ? (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {church.address}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Negócios e pessoas da comunidade mantêm a presença digital desta igreja no ar. Seu
            nome aparece na página dela, e o apoio é mensal — pode cancelar quando quiser.
          </p>

          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">Apoio mensal</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {formatCents(entryPriceCents)}
              <span className="text-base font-normal text-muted-foreground">/mês</span>
            </p>
          </div>

          <SponsorshipDisclosure churchName={church.name} churchPublicCode={church.publicCode} />

          {/* Rótulo diz o que o botão FAZ. "Já sou patrocinador" descrevia um
              estado e era lido como recusa ("já sou, obrigado"). */}
          <div className="flex flex-col gap-3">
            <Link href={`${backHere}/novo`} className={buttonVariants({ size: "lg" })}>
              Assinar patrocínio
            </Link>
            <div className="flex flex-col gap-1.5">
              <Link
                href={`/patrocinador/login?next=${encodeURIComponent(backHere)}`}
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                Entrar e adicionar esta igreja
              </Link>
              <p className="text-center text-xs text-muted-foreground">
                Já apoia outra igreja? O desconto entra sozinho, na mesma cobrança.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* O desconto é do PATROCINADOR, não da igreja — se isso não ficar
          explícito, a pessoa lê como "essa igreja já tem 3 apoiadores, então
          eu pago 29,90" e a surpresa seria para cima. */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Apoia mais de uma igreja?</CardTitle>
          <CardDescription>
            Quanto mais igrejas <strong className="text-foreground">você</strong> apoia, menor o
            valor de cada uma. O desconto é aplicado sozinho, numa cobrança única.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tiers.map((tier) => (
              <li key={tier.position} className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  {tier.position === lastTier.position && tiers.length > 1
                    ? `${tier.position}ª+`
                    : `${tier.position}ª igreja`}
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatCents(tier.amountCents)}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
