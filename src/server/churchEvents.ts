import "server-only";
import { createSupabaseChurchEventsRepository } from "@/repositories/supabase/churchEventsRepository";
import {
  createChurchEventsService,
  type ChurchEventsService,
} from "@/services/churchEventsService";
import { getSupabaseServerClient } from "./supabase-server";

/** Eventos do painel da igreja, com o client do usuário (RLS valendo). */
export async function getChurchEventsService(): Promise<ChurchEventsService> {
  return createChurchEventsService(
    createSupabaseChurchEventsRepository(await getSupabaseServerClient()),
  );
}
