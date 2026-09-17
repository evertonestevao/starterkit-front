import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthForm } from "@/features/auth/components/auth-form";
import { AccessLinkForm } from "@/features/sponsor/components/access-link-form";
import { Separator } from "@/components/ui/separator";
import { safeSponsorPath } from "@/lib/sponsorPaths";
import { signInAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Entrar como patrocinador" };

export default async function SponsorLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Mesmo signInAction do app (rate limit incluído), com destino nesta área.
  const destination = safeSponsorPath(next);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Acompanhe as igrejas que você apoia e seus pagamentos</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuthForm action={signInAction} submitLabel="Entrar">
          <input type="hidden" name="next" value={destination} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Esqueceu a senha?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
        </AuthForm>
        {/* Conta criada pela página pública não tem senha: o caminho abaixo é
            o único acesso dela. */}
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">ou</span>
          <Separator className="flex-1" />
        </div>

        <AccessLinkForm />

        <p className="text-center text-sm text-muted-foreground">
          Primeira vez por aqui?{" "}
          <Link
            href={`/patrocinador/criar-conta?next=${encodeURIComponent(destination)}`}
            className="text-foreground underline underline-offset-4"
          >
            Criar conta
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
