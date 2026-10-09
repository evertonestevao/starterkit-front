import { notFound } from "next/navigation";
import { RouteTabs, type RouteTab } from "@/components/route-tabs";
import { exigeMenu } from "@/server/menuPermissoes";
import { getTesourariaActorAutorizado } from "@/server/tesouraria";
import { canEditPix } from "@/services/churchPixService";

const BASE = "/dashboard/tesouraria";

/**
 * Tesouraria: dízimos e ofertas dos cultos. Sem o módulo, 404 mesmo com a URL
 * na mão; o service e a RLS (`tem_acesso`) recusam de novo.
 */
export default async function TesourariaLayout({ children }: { children: React.ReactNode }) {
  await exigeMenu("tesouraria");
  const actor = await getTesourariaActorAutorizado();
  if (!actor) notFound();

  const tabs: RouteTab[] = [
    { href: BASE, label: "Lançamentos" },
    { href: `${BASE}/relatorio`, label: "Relatório mensal" },
  ];
  // A chave PIX é só do Responsável e do Administrador (o service e a RLS conferem de novo).
  if (canEditPix(actor.role)) tabs.push({ href: `${BASE}/pix`, label: "Chave PIX" });

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
