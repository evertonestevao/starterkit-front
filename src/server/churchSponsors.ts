import "server-only";
import { createSupabaseChurchSponsorsRepository } from "@/repositories/supabase/churchSponsorsRepository";
import {
  createChurchSponsorsService,
  type ChurchSponsorsService,
} from "@/services/churchSponsorsService";
import { getSupabaseServerClient } from "./supabase-server";

/** Patrocinadores da igreja, com o client do usuário (a RPC checa membership). */
export async function getChurchSponsorsService(): Promise<ChurchSponsorsService> {
  return createChurchSponsorsService(
    createSupabaseChurchSponsorsRepository(await getSupabaseServerClient()),
  );
}
