import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SponsorAccountForm } from "@/features/sponsor/components/sponsor-account-form";
import { safeSponsorPath } from "@/lib/sponsorPaths";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { getSponsorService } from "@/server/sponsor";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getTermsService } from "@/server/terms";
import { createUserService } from "@/services/userService";

export const metadata: Metadata = { title: "Cadastro de patrocinador" };

export default async function SponsorProfileSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeSponsorPath(next);

  const service = await getSponsorService();
  if (await service.getMyAccount()) {
    redirect(destination);
  }

  const client = await getSupabaseServerClient();
  const [profile, needsTerms] = await Promise.all([
    createUserService(createSupabaseUserRepository(client)).getMyProfile(),
    getTermsService().then(async (terms) => !(await terms.hasAcceptedCurrent())),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quase lá</CardTitle>
        <CardDescription>
          Só precisamos destes dados para emitir a cobrança mensal do seu apoio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SponsorAccountForm
          next={destination}
          defaultName={profile?.full_name ?? ""}
          needsTerms={needsTerms}
        />
      </CardContent>
    </Card>
  );
}
