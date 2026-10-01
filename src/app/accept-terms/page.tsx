import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { AcceptTermsForm } from "@/features/terms/components/accept-terms-form";
import { signOutAction } from "@/server/actions/auth";
import { exigeUsuarioValido } from "@/server/session";
import { getTermsService } from "@/server/terms";

export const metadata: Metadata = { title: "Aceite dos termos" };

/**
 * Reaceite forçado: destino de quem tem versão de termos mais nova que a
 * aceita (ou nunca aceitou — ex.: entrou por convite, sem passar pelo
 * onboarding). O layout do dashboard redireciona para cá.
 */
export default async function AcceptTermsPage() {
  // Conta excluída com token ainda assinado: sai em vez de travar aqui.
  const user = await exigeUsuarioValido();
  const terms = await getTermsService();
  if (await terms.hasAcceptedCurrent("igreja")) {
    redirect("/dashboard");
  }
  const current = await terms.getCurrentTerms("igreja");
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
          {/* Conta errada, ou não quer aceitar agora: sempre dá para sair. */}
          <form action={signOutAction} className="flex flex-wrap items-center justify-center gap-1 text-sm text-muted-foreground">
            Entrou como {user.email}.
            <button type="submit" className="font-medium text-primary underline-offset-4 hover:underline">
              Sair
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
