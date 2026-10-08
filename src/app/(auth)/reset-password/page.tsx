import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/features/auth/components/auth-form";
import { CampoSenhaNova } from "@/features/auth/components/campo-senha-nova";
import { resetPasswordAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Nova senha" };

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Definir nova senha</CardTitle>
        <CardDescription>Escolha uma senha forte para entrar no sistema</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm action={resetPasswordAction} submitLabel="Salvar nova senha">
          <CampoSenhaNova rotulo="Nova senha" />
        </AuthForm>
      </CardContent>
    </Card>
  );
}
