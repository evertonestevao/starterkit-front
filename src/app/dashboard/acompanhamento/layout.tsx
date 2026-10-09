import { notFound } from "next/navigation";
import { RouteTabs } from "@/components/route-tabs";
import { abasDoAcompanhamento } from "@/server/abasDoMenu";
import { exigeMenu } from "@/server/menuPermissoes";

/**
 * Casca de Presença nos cultos (chamada e acompanhamento). Quem não pode acompanhar recebe 404
 * mesmo com a URL na mão; o service e a RLS (can_acompanhar) recusam de novo.
 */
export default async function AcompanhamentoLayout({ children }: { children: React.ReactNode }) {
  await exigeMenu("acompanhamento");
  const tabs = await abasDoAcompanhamento();
  if (!tabs) notFound();

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Presença nos cultos</h2>
        <p className="text-sm text-muted-foreground">A chamada de cada culto e o cuidado com quem está faltando.</p>
      </div>
      <RouteTabs tabs={tabs} />
      {children}
    </div>
  );
}
