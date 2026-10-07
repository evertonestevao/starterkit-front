import "server-only";
import { notFound } from "next/navigation";
import { menusVisiveis } from "@/lib/menuPermissoes";
import { menusComBloqueio } from "@/lib/mensalidadeAviso";
import { createSupabaseMenuPermissoesRepository } from "@/repositories/supabase/menuPermissoesRepository";
import { createMenuPermissoesService, type MenuPermissoesService } from "@/services/menuPermissoesService";
import { getSupabaseServerClient } from "./supabase-server";
import { getMensalidadeBloqueada } from "./mensalidadeBloqueio";
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
  return menusComBloqueio(menusVisiveis(active), await getMensalidadeBloqueada());
}

/**
 * Guarda de tela: sem o menu, a tela responde 404 mesmo com a URL na mão.
 * Não substitui a autorização do service nem a RLS, que conferem de novo.
 */
export async function exigeMenu(menu: string): Promise<void> {
  if (!(await getMenusVisiveis()).includes(menu)) notFound();
}
