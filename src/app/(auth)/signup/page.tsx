import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthForm } from "@/features/auth/components/auth-form";
import { signUpAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>Comece grátis — crie sua empresa em seguida</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuthForm action={signUpAction} submitLabel="Criar conta">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">Nome completo</Label>
            <Input id="fullName" name="fullName" autoComplete="name" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
        </AuthForm>
        <p className="text-center text-xs text-muted-foreground">
          Ao criar sua conta você concorda com os{" "}
          <Link
            href="/terms"
            target="_blank"
            className="text-foreground underline underline-offset-4"
          >
            Termos de Uso
          </Link>{" "}
          e com a{" "}
          <Link
            href="/privacy"
            target="_blank"
            className="text-foreground underline underline-offset-4"
          >
            Política de Privacidade
          </Link>
          .
        </p>
        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
