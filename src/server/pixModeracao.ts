import "server-only";
import { createSupabasePixModeracaoRepository } from "@/repositories/supabase/pixModeracaoRepository";
import { createPixModeracaoService, type PixModeracaoService } from "@/services/pixModeracaoService";
import { getSupabaseServerClient } from "./supabase-server";

/** Moderação do Pix das igrejas: sobre o client do usuário; as RPCs conferem `is_platform_staff()`. */
export async function getPixModeracaoService(): Promise<PixModeracaoService> {
  return createPixModeracaoService(createSupabasePixModeracaoRepository(await getSupabaseServerClient()));
}
