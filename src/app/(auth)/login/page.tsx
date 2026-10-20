import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthForm } from "@/features/auth/components/auth-form";
import { signInAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Acesse sua conta para continuar</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error === "link-invalido" ? (
          <p className="text-sm text-destructive">Link inválido ou expirado.</p>
        ) : null}
        <AuthForm action={signInAction} submitLabel="Entrar">
          {next ? <input type="hidden" name="next" value={next} /> : null}
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
        <p className="text-center text-sm text-muted-foreground">
          Não tem conta?{" "}
          <Link
            // preserva o destino (ex.: link de convite) através do cadastro
            href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            className="text-foreground underline underline-offset-4"
          >
            Criar conta
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
