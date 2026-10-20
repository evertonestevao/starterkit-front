import "server-only";
import { cache } from "react";
import { createSupabaseRedePainelRepository } from "@/repositories/supabase/redePainelRepository";
import { createRedePainelService, type RedePainelService } from "@/services/redePainelService";
import { getSupabaseServerClient } from "./supabase-server";
import { getActiveTenant } from "./tenant";

export async function getRedePainelService(): Promise<RedePainelService> {
  return createRedePainelService(createSupabaseRedePainelRepository(await getSupabaseServerClient()));
}

/**
 * A igreja ativa tem unidades abaixo? Decide se o item "Rede" aparece no menu
 * (uma consulta por request). Se a consulta falhar, o item some — melhor que
 * oferecer uma tela que não vai abrir.
 */
export const getTemUnidadesAbaixo = cache(async (): Promise<boolean> => {
  const { active } = await getActiveTenant();
  if (!active) return false;
  try {
    return await (await getRedePainelService()).temUnidades({ companyId: active.id, role: active.role });
  } catch (err) {
    console.error("[rede] falha ao verificar as unidades abaixo", err);
    return false;
  }
});
