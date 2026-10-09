import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthForm } from "@/features/auth/components/auth-form";
import { CampoSenhaNova } from "@/features/auth/components/campo-senha-nova";
import { signUpAction } from "@/server/actions/auth";
import { cadastroAberto } from "@/server/cadastro";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Cadastro só por convite: sem um link de origem (convite, vínculo, igreja
  // nova), explica. A criação da igreja é travada no banco de qualquer jeito.
  if (!next && !(await cadastroAberto())) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cadastro por convite</CardTitle>
          <CardDescription>
            No momento, o cadastro é só por convite. Abra o link que você recebeu (por e-mail ou WhatsApp) para criar
            sua conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>Primeiro vamos fazer seu cadastro, depois cadastramos a igreja</CardDescription>
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
          <CampoSenhaNova rotulo="Senha" />
        </AuthForm>
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
