import { RouteTabs, type RouteTab } from "@/components/route-tabs";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

/**
 * Casca de Configurações: cabeçalho + abas, compartilhados por todas as
 * sub-rotas. Aba nova = uma pasta em src/app/dashboard/settings + uma linha
 * aqui.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { active } = await getActiveTenant();

  const tabs: RouteTab[] = [{ href: "/dashboard/settings", label: "Geral" }];

  // Domínio é configuração de igreja, não de perfil: só quem administra vê.
  // A aba escondida é conveniência de UI — a autorização real está no
  // service e na RLS, que recusam member mesmo com a URL na mão.
  if (active && permissionService.canEditCompany(active.role)) {
    tabs.push({ href: "/dashboard/settings/domain", label: "Domínio próprio" });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Configurações</h2>
        <p className="text-sm text-muted-foreground">
          Seu perfil, a empresa ativa e o endereço público da igreja
        </p>
      </div>

      <RouteTabs tabs={tabs} />

      {children}
    </div>
  );
}
