import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IgrejasCadastradas } from "@/features/rede/components/igrejas-cadastradas";
import { PainelRede } from "@/features/rede/components/painel-rede";
import { ResponsaveisDaRede } from "@/features/rede/components/responsaveis-da-rede";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hojeISO } from "@/lib/acompanhamento";
import { exigeMenu } from "@/server/menuPermissoes";
import { getNomesNiveis } from "@/server/niveisRede";
import {
  getIgrejaQueCadastra,
  getRedeCadastroActor,
  getRedeCadastroService,
  getTrocaDeResponsavelService,
} from "@/server/redeCadastro";
import { getRedePainelService, getTemUnidadesAbaixo } from "@/server/redePainel";
import { getActiveTenant } from "@/server/tenant";
import { NomesNiveisProvider } from "@/providers/niveis-provider";

export const metadata: Metadata = { title: "Rede" };

/**
 * Rede: duas partes, cada uma para quem pode.
 *  - Painel: a saúde das igrejas abaixo. Só quem ADMINISTRA uma igreja que já
 *    tem unidades ligadas (tem números de tesouraria e mensalidade delas). O
 *    banco não devolve pessoa nenhuma das outras igrejas.
 *  - Cadastrar igrejas: quem tem "Cadastrar igrejas na rede" (Responsável,
 *    Administrador, ou o cargo liberado), numa igreja que não é congregação.
 */
export default async function RedePage() {
  await exigeMenu("rede");
  const { active } = await getActiveTenant();
  if (!active) notFound();

  const administra = active.role === "owner" || active.role === "admin";
  const [temUnidades, igreja] = await Promise.all([
    administra ? getTemUnidadesAbaixo() : Promise.resolve(false),
    getIgrejaQueCadastra(),
  ]);
  const painel = temUnidades
    ? await (await getRedePainelService()).carregar({ companyId: active.id, role: active.role })
    : null;

  const actor = igreja ? await getRedeCadastroActor() : null;
  const aguardando =
    igreja && actor
      ? await (await getRedeCadastroService()).aguardando(actor, igreja.id).catch((err: unknown) => {
          console.error("[rede] falha ao carregar as igrejas aguardando", err);
          return [];
        })
      : [];
  // Troca de responsável: só o Responsável desta igreja (o banco confere de novo).
  const responsaveis =
    igreja && actor && actor.role === "owner"
      ? await (await getTrocaDeResponsavelService()).responsaveis(actor, igreja.id).catch((err: unknown) => {
          console.error("[rede] falha ao carregar os responsaveis da rede", err);
          return null;
        })
      : null;
  const nomes = await getNomesNiveis(igreja?.id);

  return (
    <NomesNiveisProvider nomes={nomes}>
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Rede</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {painel
              ? `Como estão as igrejas ligadas a ${active.name}. Aqui aparecem só números: quem são as pessoas, o que cada uma pediu e quem entregou cada dízimo continua só com a própria igreja.`
              : `As igrejas ligadas a ${active.name}.`}
          </p>
        </div>
        {igreja ? (
          <IgrejasCadastradas
            maeId={igreja.id}
            nomeDaMae={igreja.name}
            podeSubsede={igreja.parentId === null}
            aguardando={aguardando}
            nomes={nomes}
          />
        ) : null}
        {responsaveis ? (
          <Card>
            <CardHeader>
              <CardTitle>Responsáveis das igrejas abaixo</CardTitle>
              <CardDescription>
                Quem responde por cada igreja abaixo. Aqui você adiciona mais um Responsável, troca o pastor quando ele
                muda de igreja ou tira um acesso. Tudo fica registrado na auditoria das duas igrejas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsaveisDaRede lista={responsaveis} nomes={nomes} />
            </CardContent>
          </Card>
        ) : null}
        {painel ? <PainelRede painel={painel} hoje={hojeISO()} /> : null}
      </div>
    </NomesNiveisProvider>
  );
}
