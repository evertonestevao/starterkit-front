import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Mail } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getSupabaseServerClient } from "@/server/supabase-server";

export const metadata: Metadata = { title: "Patrocínio confirmado" };

/**
 * Retorno do meio de pagamento. Quem veio por aqui pode não ter sessão —
 * pagar não cria sessão —, então o caminho principal é o link enviado por
 * email. Quem já estiver logado entra direto no painel.
 */
export default async function SponsorshipThanksPage({
  params,
}: {
  params: Promise<{ public_code: string }>;
}) {
  await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-primary" aria-hidden />
          Obrigado pelo seu apoio!
        </CardTitle>
        <CardDescription>
          Assim que o pagamento for confirmado, seu nome passa a aparecer na página da igreja.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {auth.user ? (
          <Link href="/patrocinador" className={cn(buttonVariants(), "w-full")}>
            Ir para o meu painel
          </Link>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <Mail className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <p className="text-sm leading-6 text-muted-foreground">
                Enviamos para o seu email um link de acesso ao painel, onde você acompanha as
                igrejas apoiadas e as cobranças. Não precisa criar senha.
              </p>
            </div>
            <Link
              href="/patrocinador/login"
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              Já tenho acesso, entrar
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
