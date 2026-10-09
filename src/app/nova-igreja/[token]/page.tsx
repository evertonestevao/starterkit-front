import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { conviteIgrejaValido } from "@/server/cadastro";

export const metadata: Metadata = {
  title: "Convite para cadastrar a igreja",
  // O caminho carrega o token do convite.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Convite de igreja nova, gerado pela plataforma. Já logado (o proxy manda
 * para o login antes): link válido segue para o cadastro da igreja. O banco
 * confere o convite de novo e o marca como usado.
 */
export default async function NovaIgrejaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (await conviteIgrejaValido(token)) {
    redirect(`/onboarding?igreja_nova=${encodeURIComponent(token)}`);
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Convite indisponível</CardTitle>
          <CardDescription>
            Este convite já foi usado, foi cancelado ou venceu. Peça um novo a quem enviou.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
