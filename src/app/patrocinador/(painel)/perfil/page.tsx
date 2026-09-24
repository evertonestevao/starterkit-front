import type { Metadata } from "next";
import { Clock3, Lock, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SponsorProfileForm } from "@/features/sponsor/components/sponsor-profile-form";
import { sponsorLinkToInput } from "@/lib/sponsorLink";
import { getSponsorService } from "@/server/sponsor";
import { getSponsorProfileService } from "@/server/sponsorProfile";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function SponsorProfilePage() {
  const [{ account, pending, pendingLogoUrl }, sponsorAccount] = await Promise.all([
    (await getSponsorProfileService()).getMyProfile(),
    (await getSponsorService()).getMyAccount(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meu perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          O que as igrejas que você apoia mostram na página delas.
        </p>
      </div>

      {account.securityHoldAt ? (
        <Alert variant="destructive">
          <Lock className="size-4" />
          <AlertDescription>
            Sua conta está bloqueada para alterações porque alguém acionou o “não fui eu” em um
            email nosso. Fale com o suporte para liberar.
          </AlertDescription>
        </Alert>
      ) : null}

      {pending ? (
        <Alert>
          <Clock3 className="size-4" />
          <AlertDescription>
            Você já tem uma alteração esperando conferência
            {pending.novo_display_name ? ` (novo nome: “${pending.novo_display_name}”)` : ""}
            {pending.novo_logo_path ? " (logo novo enviado)" : ""}
            {pending.novo_link_alterado
              ? pending.novo_link_valor
                ? " (novo link da logo)"
                : " (link da logo removido)"
              : ""}
            . Até
            ela ser aprovada, as igrejas seguem exibindo o perfil atual. Enviar outra substitui
            esta.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Dados</CardTitle>
          <CardDescription>
            {sponsorAccount?.kind === "business"
              ? "Nome do negócio e contato."
              : "Seu nome e contato."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SponsorProfileForm
            displayName={account.displayName}
            phone={sponsorAccount?.phone ?? null}
            logoUrl={account.logoUrl}
            pendingLogoUrl={pendingLogoUrl}
            linkInicial={
              account.link ? sponsorLinkToInput({ tipo: account.link.tipo, valor: account.link.valor }) : ""
            }
            bloqueada={Boolean(account.securityHoldAt)}
            visibleOnPage={sponsorAccount?.visible_on_page ?? true}
          />
        </CardContent>
      </Card>

      {/* Explicar a espera é o que evita o ticket "salvei e não mudou". */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            Por que o nome, o logo e o link demoram para mudar
          </CardTitle>
          <CardDescription>
            Eles aparecem em páginas públicas de igrejas — e o link leva quem clica para fora
            delas. Se qualquer um pudesse trocar na hora, bastaria uma conta invadida para pôr algo
            indevido no ar. Por isso a equipe confere
            antes — e avisamos você por email a cada pedido, com um botão para desfazer caso não
            tenha sido você.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
