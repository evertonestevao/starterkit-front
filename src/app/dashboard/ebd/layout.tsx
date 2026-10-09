import { notFound } from "next/navigation";
import { RouteTabs } from "@/components/route-tabs";
import { abasDaEbd } from "@/server/abasDoMenu";
import { exigeMenu } from "@/server/menuPermissoes";

/**
 * EBD — Escola Bíblica Dominical. Quem não é da gestão nem professor recebe
 * 404 mesmo com a URL na mão; o service e a RLS (can_ebd_classe) recusam de novo.
 */
export default async function EbdLayout({ children }: { children: React.ReactNode }) {
  await exigeMenu("ebd");
  const tabs = await abasDaEbd();
  if (!tabs) notFound();

  return (
    <div className="flex max-w-4xl flex-col gap-6 print:max-w-none">
      <div className="print:hidden">
        <h2 className="text-xl font-semibold tracking-tight">Escola Bíblica Dominical</h2>
        <p className="text-sm text-muted-foreground">Classes, alunos e a chamada de cada domingo.</p>
      </div>
      <RouteTabs tabs={tabs} />
      {children}
    </div>
  );
}
