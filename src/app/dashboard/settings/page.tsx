import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyNameForm } from "@/features/companies/components/settings-forms";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Configurações" };

/**
 * Aba "Geral" das Configurações DA IGREJA. O que é da pessoa (foto, nome,
 * convites, sair da igreja) fica em Minha conta, no menu do perfil.
 */
export default async function SettingsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null;
  // Link antigo de quem não administra: o que havia aqui para ele mudou de lugar.
  if (!permissionService.canEditCompany(active.role)) redirect("/dashboard/conta");

  // Título e abas vivem no layout: aqui fica só o conteúdo da aba "Geral".
  return (
    <Card>
      <CardHeader>
        <CardTitle>Igreja</CardTitle>
        <CardDescription>Dados de {active.name}</CardDescription>
      </CardHeader>
      <CardContent>
        <CompanyNameForm />
      </CardContent>
    </Card>
  );
}
