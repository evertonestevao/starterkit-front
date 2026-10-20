import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UndoChangeForm } from "@/features/sponsor/components/undo-change-form";

export const metadata: Metadata = {
  title: "Não fui eu",
  // A página não deve ser indexada nem aparecer em referrer de terceiros.
  robots: { index: false, follow: false },
};

/**
 * Destino do link "não fui eu" dos emails de alteração de perfil.
 *
 * Abre SEM login de propósito: quem teve a conta invadida pode não conseguir
 * entrar. A prova de posse é o token, que chegou no email da conta.
 *
 * A página não confirma nem nega que o token existe antes do clique — ela só
 * explica o que o botão faz. Quem chutou uma URL não descobre nada, e o
 * cancelamento em si não acontece no GET.
 */
export default async function UndoProfileChangePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-destructive" aria-hidden />
          Não foi você?
        </CardTitle>
        <CardDescription>
          Alguém pediu para alterar o nome ou o logo que aparecem nas páginas das igrejas que você
          apoia.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-sm leading-6 text-muted-foreground">
          Se o pedido foi seu, é só fechar esta página — ele segue para a conferência da nossa
          equipe normalmente.
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          Se não foi, o botão abaixo cancela o pedido, devolve seu perfil ao que estava e bloqueia
          novas alterações na sua conta até você falar com o suporte.
        </p>
        <UndoChangeForm token={token} />
      </CardContent>
    </Card>
  );
}
