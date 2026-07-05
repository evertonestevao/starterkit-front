import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { AcceptInviteButton } from "@/features/companies/components/accept-invite-button";

export const metadata: Metadata = { title: "Aceitar convite" };

/** Destino do link do email de convite. O aceite em si é uma server action. */
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Convite para uma empresa</CardTitle>
          <CardDescription>
            Ao aceitar, você entra na empresa com o papel definido no convite.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {token ? (
            <AcceptInviteButton token={token} />
          ) : (
            <>
              <p className="text-sm text-destructive">Link de convite inválido.</p>
              <Button variant="outline" render={<Link href="/dashboard" />}>
                Ir para o dashboard
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
