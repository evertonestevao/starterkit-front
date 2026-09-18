import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { brand } from "@/config/brand";
import { CreateCompanyForm } from "@/features/companies/components/create-company-form";
import { isPlatformStaff } from "@/server/platform";
import { getActiveTenant } from "@/server/tenant";
import { getTermsService } from "@/server/terms";

export const metadata: Metadata = { title: "Criar igreja" };

/**
 * Onboarding: caminho crítico signup → aceitar termos → criar empresa →
 * virar owner. Quem já tem empresa não passa por aqui.
 */
export default async function OnboardingPage() {
  const { companies } = await getActiveTenant();
  if (companies.length > 0) {
    redirect("/dashboard");
  }

  // Quem modera a plataforma não é uma igreja sem cadastro. O cadastro público
  // leva todo mundo para cá; a moderação segue para a área dela. Para testar
  // como igreja, use outra conta — misturar operador e cliente na mesma
  // identidade embaralha a auditoria dos dois lados.
  if (await isPlatformStaff()) {
    redirect("/plataforma");
  }

  const terms = await getTermsService();
  const requireTerms = !(await terms.hasAcceptedCurrent("igreja"));

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Cadastre sua igreja</CardTitle>
          <CardDescription>
            Organize a presença digital da sua igreja. Você será o responsável
            por este espaço.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateCompanyForm requireTerms={requireTerms} />
        </CardContent>
      </Card>
    </div>
  );
}
