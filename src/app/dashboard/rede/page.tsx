import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PainelRede } from "@/features/rede/components/painel-rede";
import { hojeISO } from "@/lib/acompanhamento";
import { exigeMenu } from "@/server/menuPermissoes";
import { getRedePainelService } from "@/server/redePainel";
import { getActiveTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Rede" };

/**
 * Painel da rede: a saúde das igrejas abaixo da igreja ativa. Só existe para
 * quem administra uma igreja que tem unidades ligadas a ela (o menu some para
 * as demais, e esta guarda responde 404). O que chega aqui são números — o
 * banco não devolve pessoa nenhuma das outras igrejas.
 */
export default async function RedePage() {
  await exigeMenu("rede");
  const { active } = await getActiveTenant();
  if (!active) notFound();

  const painel = await (await getRedePainelService()).carregar({ companyId: active.id, role: active.role });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Rede</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Como estão as igrejas ligadas a {active.name}. Aqui aparecem só números: quem são as pessoas, o que cada uma
          pediu e quem entregou cada dízimo continua só com a própria igreja.
        </p>
      </div>
      <PainelRede painel={painel} hoje={hojeISO()} />
    </div>
  );
}
