import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthForm } from "@/features/auth/components/auth-form";
import { CampoSenhaNova } from "@/features/auth/components/campo-senha-nova";
import { safeSponsorPath } from "@/lib/sponsorPaths";
import { signUpAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Criar conta de patrocinador" };

export default async function SponsorSignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination = safeSponsorPath(next);
  // Depois das credenciais vem o cadastro do patrocinador, que devolve a
  // pessoa para onde ela ia (ex.: a confirmação de uma igreja).
  const afterSignUp = `/patrocinador/cadastro?next=${encodeURIComponent(destination)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>Você não precisa ser membro da igreja para apoiá-la.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuthForm action={signUpAction} submitLabel="Continuar">
          <input type="hidden" name="next" value={afterSignUp} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">Seu nome</Label>
            <Input id="fullName" name="fullName" autoComplete="name" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
            <p className="text-xs text-muted-foreground">As faturas são enviadas para este email.</p>
          </div>
          <CampoSenhaNova />
        </AuthForm>
        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link
            href={`/patrocinador/login?next=${encodeURIComponent(destination)}`}
            className="text-foreground underline underline-offset-4"
          >
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
