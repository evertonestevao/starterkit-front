import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { CreateCompanyForm } from "@/features/companies/components/create-company-form";
import { getActiveTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Criar empresa" };

/**
 * Onboarding: caminho crítico signup → criar empresa → virar owner.
 * Quem já tem empresa não precisa passar por aqui.
 */
export default async function OnboardingPage() {
  const { companies } = await getActiveTenant();
  if (companies.length > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Crie sua empresa</CardTitle>
          <CardDescription>
            Todo dado do {brand.name} pertence a uma empresa. Você será o owner desta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateCompanyForm />
        </CardContent>
      </Card>
    </div>
  );
}
