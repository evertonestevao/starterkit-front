import { notFound } from "next/navigation";
import { exigeMenu } from "@/server/menuPermissoes";
import { RouteTabs, type RouteTab } from "@/components/route-tabs";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";
import { canConfigurar } from "@/services/acompanhamentoService";

const BASE = "/dashboard/acompanhamento";

/**
 * Casca de Presença nos cultos (chamada e acompanhamento). Quem não pode acompanhar recebe 404
 * mesmo com a URL na mão; o service e a RLS (can_acompanhar) recusam de novo.
 */
export default async function AcompanhamentoLayout({ children }: { children: React.ReactNode }) {
  await exigeMenu("acompanhamento");
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();

  const resumo = await (await getAcompanhamentoService()).resumo(actor).catch((err: unknown) => {
    console.error("[acompanhamento] falha ao montar o resumo das abas", err);
    return null;
  });

  const tabs: RouteTab[] = [
    { href: BASE, label: "Resumo" },
    { href: `${BASE}/alertas`, label: "Em alerta", count: resumo?.emAlerta },
    { href: `${BASE}/justificativas-longas`, label: "Justificativas longas", count: resumo?.justificativasLongas },
    { href: `${BASE}/justificativas`, label: "Justificativas" },
    { href: `${BASE}/cultos`, label: "Cultos e chamada" },
    { href: `${BASE}/relatorios`, label: "Relatórios" },
  ];
  if (canConfigurar(actor.role)) tabs.push({ href: `${BASE}/regras`, label: "Regras" });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Presença nos cultos</h2>
        <p className="text-sm text-muted-foreground">
          A chamada de cada culto e o cuidado com quem está faltando.
        </p>
      </div>
      <RouteTabs tabs={tabs} />
      {children}
    </div>
  );
}
