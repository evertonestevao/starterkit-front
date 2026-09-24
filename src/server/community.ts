import "server-only";
import { createSupabaseCommunityRepository } from "@/repositories/supabase/communityRepository";
import { createCommunityService, type CommunityService } from "@/services/communityService";
import { getSupabaseServerClient } from "./supabase-server";

/** Serviço do que a comunidade enviou, com o client do usuário (RLS valendo). */
export async function getCommunityService(): Promise<CommunityService> {
  return createCommunityService(createSupabaseCommunityRepository(await getSupabaseServerClient()));
}
