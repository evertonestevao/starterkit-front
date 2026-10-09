import "server-only";
import { cache } from "react";
import type { RouteTab } from "@/components/route-tabs";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "./acompanhamento";
import { getCarteirinhaActorAutorizado, getCarteirinhaService } from "./carteirinha";
import { getEbdActorAutorizado, getEbdService } from "./ebd";
import { getMenusVisiveis } from "./menuPermissoes";
import { getActiveTenant } from "./tenant";
import { getTesourariaActorAutorizado } from "./tesouraria";
import { canConfigurar } from "@/services/acompanhamentoService";
import { canEditPix } from "@/services/churchPixService";
import { canConfigureReceiving } from "@/services/churchReceivingService";
import { canGerirEbd } from "@/services/ebdService";
import { canConfigurarAcessos } from "@/services/menuPermissoesService";
import { permissionService } from "@/services/permissionService";

/**
 * Subitens de cada seção do menu lateral. Montados aqui (e não só quando a
 * pessoa entra na seção) para o menu já mostrar a setinha e a lista antes do
 * clique. O layout de cada seção usa a mesma função; `cache` faz uma consulta
 * por request. Null = a pessoa não entra na seção.
 */

export const abasDaEbd = cache(async (): Promise<RouteTab[] | null> => {
  const actor = await getEbdActorAutorizado();
  if (!actor) return null;
  const base = "/dashboard/ebd";
  // Quantos em alerta, para o número na aba. Falhar aqui não derruba a página.
  const emAlerta = await (
    await getEbdService()
  )
    .alertas(actor)
    .then((r) => r.alertas.filter((a) => a.situacao === "pendente").length)
    .catch((err: unknown) => {
      console.error("[ebd] falha ao contar os alertas", err);
      return 0;
    });
  const tabs: RouteTab[] = [
    { href: base, label: "Resumo" },
    { href: `${base}/alunos`, label: "Alunos" },
    // As classes: a página de cada uma fica embaixo deste endereço.
    { href: `${base}/classes`, label: "Salas" },
    { href: `${base}/alertas`, label: "Em alerta", count: emAlerta },
    { href: `${base}/relatorios`, label: "Relatórios" },
  ];
  if (canGerirEbd(actor.role, actor.podeGerirEbd)) {
    tabs.splice(2, 0, { href: `${base}/professores`, label: "Professores" });
    tabs.push({ href: `${base}/destaques`, label: "Destaques" });
    tabs.push({ href: `${base}/trimestres`, label: "Trimestres" });
    tabs.push({ href: `${base}/promocao`, label: "Promoção" });
    tabs.push({ href: `${base}/regras`, label: "Regras" });
  }
  return tabs;
});

export const abasDoAcompanhamento = cache(async (): Promise<RouteTab[] | null> => {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) return null;
  const base = "/dashboard/acompanhamento";
  const resumo = await (await getAcompanhamentoService()).resumo(actor).catch((err: unknown) => {
    console.error("[acompanhamento] falha ao montar o resumo das abas", err);
    return null;
  });
  const tabs: RouteTab[] = [
    { href: base, label: "Resumo" },
    { href: `${base}/alertas`, label: "Em alerta", count: resumo?.emAlerta },
    { href: `${base}/justificativas-longas`, label: "Justificativas longas", count: resumo?.justificativasLongas },
    { href: `${base}/justificativas`, label: "Justificativas" },
    { href: `${base}/cultos`, label: "Cultos e chamada" },
    { href: `${base}/relatorios`, label: "Relatórios" },
  ];
  if (canConfigurar(actor.role)) tabs.push({ href: `${base}/regras`, label: "Regras" });
  return tabs;
});

export const abasDaTesouraria = cache(async (): Promise<RouteTab[] | null> => {
  const actor = await getTesourariaActorAutorizado();
  if (!actor) return null;
  const base = "/dashboard/tesouraria";
  const tabs: RouteTab[] = [
    { href: base, label: "Lançamentos" },
    { href: `${base}/relatorio`, label: "Relatório mensal" },
  ];
  // A chave PIX e o cartão são só de quem configura (o service e a RLS conferem de novo).
  if (canEditPix(actor.role)) tabs.push({ href: `${base}/pix`, label: "Chave PIX" });
  if (canConfigureReceiving(actor.role)) tabs.push({ href: `${base}/cartao`, label: "Cartão" });
  return tabs;
});

/**
 * O modelo da carteirinha é da igreja do topo da rede (sede ou independente):
 * só ela vê a aba. Falhar aqui só esconde a aba, não derruba Configurações.
 */
async function defineCarteirinha(): Promise<boolean> {
  const actor = await getCarteirinhaActorAutorizado();
  if (!actor) return false;
  return (await getCarteirinhaService())
    .modelo(actor)
    .then((m) => m.podeEditar)
    .catch((err: unknown) => {
      console.error("[configuracoes] falha ao ver quem define a carteirinha", err);
      return false;
    });
}

export const abasDasConfiguracoes = cache(async (): Promise<RouteTab[]> => {
  const { active } = await getActiveTenant();
  const base = "/dashboard/settings";
  const tabs: RouteTab[] = [{ href: base, label: "Geral" }];
  // Tudo aqui é configuração DA IGREJA: só quem administra vê. O que é da
  // pessoa fica em Minha conta (/dashboard/conta), no menu do perfil.
  // A aba escondida é conveniência de UI — a autorização real está no
  // service e na RLS, que recusam member mesmo com a URL na mão.
  if (active && permissionService.canEditCompany(active.role)) {
    tabs.push({ href: `${base}/igreja`, label: "Página da igreja" });
    tabs.push({ href: `${base}/cargos`, label: "Cargos" });
    if (canConfigurarAcessos(active.role)) tabs.push({ href: `${base}/acessos`, label: "Acessos" });
    // Quem entra no sistema e com que papel: só o Responsável.
    if (active.role === "owner") tabs.push({ href: `${base}/quem-acessa`, label: "Quem acessa" });
    tabs.push({ href: `${base}/documentos`, label: "Documentos" });
    if (await defineCarteirinha()) tabs.push({ href: `${base}/carteirinha`, label: "Carteirinha" });
    tabs.push({ href: `${base}/vinculos`, label: "Vínculos" });
    tabs.push({ href: `${base}/domain`, label: "Domínio próprio" });
    // Com a Tesouraria ligada, a chave PIX e o cartão ficam em abas de lá.
    if (!active.modulosAtivos.includes("tesouraria")) {
      tabs.push({ href: `${base}/pix`, label: "Dízimos (PIX)" });
      tabs.push({ href: `${base}/recebimento`, label: "Cartão" });
    }
  }
  // Por último: o histórico do que foi feito.
  if ((await getMenusVisiveis()).includes("audit")) tabs.push({ href: `${base}/auditoria`, label: "Auditoria" });
  return tabs;
});

/** Subitens por endereço da seção, só das seções que a pessoa vê no menu. */
export async function getSubmenus(): Promise<Record<string, RouteTab[]>> {
  const menus = await getMenusVisiveis();
  const secoes: Array<[string, string, () => Promise<RouteTab[] | null>]> = [
    ["acompanhamento", "/dashboard/acompanhamento", abasDoAcompanhamento],
    ["ebd", "/dashboard/ebd", abasDaEbd],
    ["tesouraria", "/dashboard/tesouraria", abasDaTesouraria],
    ["settings", "/dashboard/settings", abasDasConfiguracoes],
  ];
  const resultado: Record<string, RouteTab[]> = {};
  await Promise.all(
    secoes
      .filter(([menu]) => menus.includes(menu))
      .map(async ([, href, abas]) => {
        const tabs = await abas();
        if (tabs && tabs.length > 1) resultado[href] = tabs;
      }),
  );
  return resultado;
}
