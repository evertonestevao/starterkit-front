import { notFound } from "next/navigation";
import { RouteTabs } from "@/components/route-tabs";
import { abasDaTesouraria } from "@/server/abasDoMenu";
import { exigeMenu } from "@/server/menuPermissoes";

/**
 * Tesouraria: dízimos e ofertas dos cultos, a chave PIX e o cartão. Sem o
 * módulo, 404 mesmo com a URL na mão; o service e a RLS (`tem_acesso`)
 * recusam de novo.
 */
export default async function TesourariaLayout({ children }: { children: React.ReactNode }) {
  await exigeMenu("tesouraria");
  const tabs = await abasDaTesouraria();
  if (!tabs) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
        <h2 className="text-xl font-semibold tracking-tight">Tesouraria</h2>
        <p className="text-sm text-muted-foreground">Dízimos e ofertas dos cultos. A oferta da EBD fica na EBD.</p>
      </div>
      <RouteTabs tabs={tabs} />
      {children}
    </div>
  );
}
