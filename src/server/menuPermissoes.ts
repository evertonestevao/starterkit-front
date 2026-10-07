import "server-only";
import { notFound } from "next/navigation";
import { menusVisiveis } from "@/lib/menuPermissoes";
import { menusComBloqueio } from "@/lib/mensalidadeAviso";
import { MENU_REDE, menusComRede } from "@/lib/painelRede";
import { createSupabaseMenuPermissoesRepository } from "@/repositories/supabase/menuPermissoesRepository";
import { createMenuPermissoesService, type MenuPermissoesService } from "@/services/menuPermissoesService";
import { getSupabaseServerClient } from "./supabase-server";
import { getMensalidadeBloqueada } from "./mensalidadeBloqueio";
import { getTemUnidadesAbaixo } from "./redePainel";
import { getActiveTenant } from "./tenant";

export async function getMenuPermissoesService(): Promise<MenuPermissoesService> {
  return createMenuPermissoesService(createSupabaseMenuPermissoesRepository(await getSupabaseServerClient()));
}

/**
 * Menus que a pessoa logada vê na igreja ativa (papel + módulos liberados).
 * Igreja com o painel suspenso por mensalidade pendente: só a mensalidade —
 * e, como `exigeMenu` lê daqui, as outras telas respondem 404.
 */
export async function getMenusVisiveis(): Promise<string[]> {
  const { active } = await getActiveTenant();
  if (!active) return [];
  const menus = menusVisiveis(active);
  // "Rede" só para a igreja que tem unidades abaixo (e só consulta se o papel já dá o item).
  const comRede = menus.includes(MENU_REDE) ? menusComRede(menus, await getTemUnidadesAbaixo()) : menus;
  return menusComBloqueio(comRede, await getMensalidadeBloqueada());
}

/**
 * Guarda de tela: sem o menu, a tela responde 404 mesmo com a URL na mão.
 * Não substitui a autorização do service nem a RLS, que conferem de novo.
 */
export async function exigeMenu(menu: string): Promise<void> {
  if (!(await getMenusVisiveis()).includes(menu)) notFound();
}
