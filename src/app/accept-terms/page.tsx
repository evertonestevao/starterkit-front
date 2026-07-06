import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { AcceptTermsForm } from "@/features/terms/components/accept-terms-form";
import { getTermsService } from "@/server/terms";

export const metadata: Metadata = { title: "Aceite dos termos" };

/**
 * Reaceite forçado: destino de quem tem versão de termos mais nova que a
 * aceita (ou nunca aceitou — ex.: entrou por convite, sem passar pelo
 * onboarding). O layout do dashboard redireciona para cá.
 */
export default async function AcceptTermsPage() {
  const terms = await getTermsService();
  if (await terms.hasAcceptedCurrent()) {
    redirect("/dashboard");
  }
  const current = await terms.getCurrentTerms();
  if (!current) {
    redirect("/dashboard"); // sem versão publicada não há o que aceitar
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Termos de Uso — versão {current.version}</CardTitle>
          <CardDescription>
            Para continuar usando o {brand.name}, leia e aceite a versão vigente dos termos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">
            {current.content}
          </div>
          <AcceptTermsForm />
        </CardContent>
      </Card>
    </div>
  );
}
