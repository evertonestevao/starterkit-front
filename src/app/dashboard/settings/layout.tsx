import { RouteTabs, type RouteTab } from "@/components/route-tabs";
import { getCarteirinhaActorAutorizado, getCarteirinhaService } from "@/server/carteirinha";
import { getActiveTenant } from "@/server/tenant";
import { canConfigurarAcessos } from "@/services/menuPermissoesService";
import { permissionService } from "@/services/permissionService";

/**
 * O modelo da carteirinha é da igreja do topo da rede (sede ou independente):
 * só ela vê a aba. Falhar aqui só esconde a aba, não derruba Configurações.
 */
async function defineCarteirinha(): Promise<boolean> {
  const actor = await getCarteirinhaActorAutorizado();
  if (!actor) return false;
  return (await getCarteirinhaService())
    .modelo(actor)
    .then((m) => m.podeEditar)
    .catch((err: unknown) => {
      console.error("[configuracoes] falha ao ver quem define a carteirinha", err);
      return false;
    });
}

/**
 * Casca de Configurações: cabeçalho + abas, compartilhados por todas as
 * sub-rotas. Aba nova = uma pasta em src/app/dashboard/settings + uma linha
 * aqui.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { active } = await getActiveTenant();

  const tabs: RouteTab[] = [{ href: "/dashboard/settings", label: "Geral" }];

  // Tudo aqui é configuração DA IGREJA: só quem administra vê. O que é da
  // pessoa fica em Minha conta (/dashboard/conta), no menu do perfil.
  // A aba escondida é conveniência de UI — a autorização real está no
  // service e na RLS, que recusam member mesmo com a URL na mão.
  if (active && permissionService.canEditCompany(active.role)) {
    tabs.push({ href: "/dashboard/settings/igreja", label: "Página da igreja" });
    tabs.push({ href: "/dashboard/settings/cargos", label: "Cargos" });
    if (canConfigurarAcessos(active.role)) tabs.push({ href: "/dashboard/settings/acessos", label: "Acessos" });
    tabs.push({ href: "/dashboard/settings/documentos", label: "Documentos" });
    if (await defineCarteirinha()) tabs.push({ href: "/dashboard/settings/carteirinha", label: "Carteirinha" });
    tabs.push({ href: "/dashboard/settings/vinculos", label: "Vínculos" });
    tabs.push({ href: "/dashboard/settings/domain", label: "Domínio próprio" });
    tabs.push({ href: "/dashboard/settings/pix", label: "Dízimos (PIX)" });
    tabs.push({ href: "/dashboard/settings/recebimento", label: "Cartão" });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Configurações</h2>
        <p className="text-sm text-muted-foreground">A igreja ativa, a página pública dela e quem acessa o quê</p>
      </div>

      <RouteTabs tabs={tabs} />

      {children}
    </div>
  );
}
