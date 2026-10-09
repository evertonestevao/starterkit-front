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
import { getIgrejaQueCadastra } from "./redeCadastro";
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
  let comRede = menus.includes(MENU_REDE) ? menusComRede(menus, await getTemUnidadesAbaixo()) : menus;
  // Quem cadastra igrejas na rede também abre "Rede" (é lá que cadastra), mesmo
  // antes de ter alguma abaixo — o painel com os números fica só para quem administra.
  if (!comRede.includes(MENU_REDE) && (await getIgrejaQueCadastra())) comRede = [...comRede, MENU_REDE];
  return menusComBloqueio(comRede, await getMensalidadeBloqueada());
}

/**
 * Guarda de tela: sem o menu, a tela responde 404 mesmo com a URL na mão.
 * Não substitui a autorização do service nem a RLS, que conferem de novo.
 */
export async function exigeMenu(menu: string): Promise<void> {
  if (!(await getMenusVisiveis()).includes(menu)) notFound();
}
