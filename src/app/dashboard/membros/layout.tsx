import { notFound } from "next/navigation";
import { exigeMenu } from "@/server/menuPermissoes";
import { getAcompanhamentoActorAutorizado } from "@/server/acompanhamento";

/**
 * Membros da igreja: o rol (quem aparece na chamada). Área própria, separada
 * de "Pessoas" (quem tem login no sistema). Mesmo acesso da Chamada: quem não
 * pode recebe 404, e o service e a RLS (can_acompanhar) recusam de novo.
 */
export default async function MembrosLayout({ children }: { children: React.ReactNode }) {
  await exigeMenu("membros");
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Membros</h2>
        <p className="text-sm text-muted-foreground">
          As pessoas da igreja. Quem está ativo aparece na chamada dos cultos.
        </p>
      </div>
      {children}
    </div>
  );
}
