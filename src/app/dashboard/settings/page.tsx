import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChurchDataForm } from "@/features/church/components/church-data-form";
import { CompanyNameForm } from "@/features/companies/components/settings-forms";
import { getChurchProfileService } from "@/server/churchProfile";
import { canEditChurchProfile } from "@/services/churchProfileService";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Configurações" };

/**
 * Aba "Geral" das Configurações DA IGREJA: os dados da igreja (nome,
 * sobrenome, endereço). O que é só da página pública fica em Página da igreja. O que é da pessoa (foto, nome,
 * convites, sair da igreja) fica em Minha conta, no menu do perfil.
 */
export default async function SettingsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null;
  // Link antigo de quem não administra: o que havia aqui para ele mudou de lugar.
  if (!permissionService.canEditCompany(active.role)) redirect("/dashboard/conta");

  const igrejas = canEditChurchProfile(active.role) ? await (await getChurchProfileService()).list(active.id) : [];

  // Título e abas vivem no layout: aqui fica só o conteúdo da aba "Geral".
  return (
    <div className="flex flex-col gap-6">
      {igrejas.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Dados da igreja</CardTitle>
            <CardDescription>
              Nome e endereço. Aparecem na página pública, no &quot;Como chegar&quot; e nos documentos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChurchDataForm igrejas={igrejas} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Nome da conta</CardTitle>
          <CardDescription>Como a conta aparece no menu de troca de igreja, no topo do painel.</CardDescription>
        </CardHeader>
        <CardContent>
          <CompanyNameForm />
        </CardContent>
      </Card>
    </div>
  );
}
