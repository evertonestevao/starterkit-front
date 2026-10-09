import { RouteTabs } from "@/components/route-tabs";
import { abasDasConfiguracoes } from "@/server/abasDoMenu";

/**
 * Casca de Configurações: cabeçalho + abas, compartilhados por todas as
 * sub-rotas. Aba nova = uma pasta em src/app/dashboard/settings + uma linha
 * em src/server/abasDoMenu.ts.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const tabs = await abasDasConfiguracoes();

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
