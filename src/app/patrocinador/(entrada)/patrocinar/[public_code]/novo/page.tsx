import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PublicSponsorshipForm } from "@/features/sponsor/components/public-sponsorship-form";
import { SponsorshipDisclosure } from "@/features/sponsor/components/sponsorship-disclosure";
import { isAppError } from "@/lib/errors";
import { sponsorshipPath } from "@/lib/sponsorPaths";
import { getPublicSponsorService } from "@/server/sponsor";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { formatCents } from "@/services/sponsorPricing";

export const metadata: Metadata = { title: "Assinar patrocínio" };

/** Cadastro do patrocinador novo, sem senha: o acesso chega por email. */
export default async function NewSponsorshipPage({
  params,
}: {
  params: Promise<{ public_code: string }>;
}) {
  const { public_code } = await params;

  // Quem já está logado não precisa deste formulário: a tela de convite
  // mostra o valor exato dele e confirma em um clique.
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    redirect(sponsorshipPath(public_code));
  }

  let invite;
  try {
    invite = await getPublicSponsorService().getInviteData(public_code);
  } catch (err) {
    if (isAppError(err) && err.code === "not_found") notFound();
    throw err;
  }

  return (
    <Card>
      <CardHeader>
        <Link
          href={sponsorshipPath(public_code)}
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Voltar
        </Link>
        <CardTitle className="mt-2">Assinar patrocínio</CardTitle>
        <CardDescription>
          Apoio a {invite.church.name} · {formatCents(invite.entryPriceCents)}
          /mês
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <PublicSponsorshipForm
          churchPublicCode={invite.church.publicCode}
          priceLabel={formatCents(invite.entryPriceCents)}
        />
        <SponsorshipDisclosure
          churchName={invite.church.name}
          churchPublicCode={invite.church.publicCode}
        />
      </CardContent>
    </Card>
  );
}
