import { notFound } from "next/navigation";
import { exigeMenu } from "@/server/menuPermissoes";
import { RouteTabs, type RouteTab } from "@/components/route-tabs";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import { canGerirEbd } from "@/services/ebdService";

const BASE = "/dashboard/ebd";

/**
 * EBD — Escola Bíblica Dominical. Quem não é da gestão nem professor recebe
 * 404 mesmo com a URL na mão; o service e a RLS (can_ebd_classe) recusam de novo.
 */
export default async function EbdLayout({ children }: { children: React.ReactNode }) {
  await exigeMenu("ebd");
  const actor = await getEbdActorAutorizado();
  if (!actor) notFound();

  // Quantos em alerta, para o número na aba. Falhar aqui não derruba a página.
  const emAlerta = await (await getEbdService())
    .alertas(actor)
    .then((r) => r.alertas.filter((a) => a.situacao === "pendente").length)
    .catch((err: unknown) => {
      console.error("[ebd] falha ao contar os alertas", err);
      return 0;
    });

  const tabs: RouteTab[] = [
    { href: BASE, label: "Resumo" },
    { href: `${BASE}/alertas`, label: "Em alerta", count: emAlerta },
    { href: `${BASE}/relatorios`, label: "Relatórios" },
  ];
  if (canGerirEbd(actor.role, actor.podeGerirEbd)) {
    tabs.push({ href: `${BASE}/trimestres`, label: "Trimestres" });
    tabs.push({ href: `${BASE}/promocao`, label: "Promoção" });
    tabs.push({ href: `${BASE}/regras`, label: "Regras" });
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Escola Bíblica Dominical</h2>
        <p className="text-sm text-muted-foreground">Classes, alunos e a chamada de cada domingo.</p>
      </div>
      <RouteTabs tabs={tabs} />
      {children}
    </div>
  );
}
