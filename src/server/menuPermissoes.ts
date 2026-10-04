import "server-only";
import { notFound } from "next/navigation";
import { menusVisiveis } from "@/lib/menuPermissoes";
import { createSupabaseMenuPermissoesRepository } from "@/repositories/supabase/menuPermissoesRepository";
import { createMenuPermissoesService, type MenuPermissoesService } from "@/services/menuPermissoesService";
import { getSupabaseServerClient } from "./supabase-server";
import { getActiveTenant } from "./tenant";

export async function getMenuPermissoesService(): Promise<MenuPermissoesService> {
  return createMenuPermissoesService(createSupabaseMenuPermissoesRepository(await getSupabaseServerClient()));
}

/** Menus que a pessoa logada vê na igreja ativa (papel + módulos liberados). */
export async function getMenusVisiveis(): Promise<string[]> {
  const { active } = await getActiveTenant();
  return active ? menusVisiveis(active) : [];
}

/**
 * Guarda de tela: sem o menu, a tela responde 404 mesmo com a URL na mão.
 * Não substitui a autorização do service nem a RLS, que conferem de novo.
 */
export async function exigeMenu(menu: string): Promise<void> {
  if (!(await getMenusVisiveis()).includes(menu)) notFound();
}
