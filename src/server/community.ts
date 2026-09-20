import "server-only";
import {
  createSupabaseCommunityRepository,
  listPrayerCountsTree,
} from "@/repositories/supabase/communityRepository";
import { createCommunityService, type CommunityService } from "@/services/communityService";
import { getSupabaseServerClient } from "./supabase-server";

/** Serviço do que a comunidade enviou, com o client do usuário (RLS valendo). */
export async function getCommunityService(): Promise<CommunityService> {
  return createCommunityService(createSupabaseCommunityRepository(await getSupabaseServerClient()));
}

/**
 * Contagem de pedidos de oração por igreja da subárvore (própria + as de
 * baixo). Quem está acima recebe o número, nunca o texto.
 */
export async function getPrayerCountsTree(dias = 30) {
  return listPrayerCountsTree(await getSupabaseServerClient(), dias);
}
