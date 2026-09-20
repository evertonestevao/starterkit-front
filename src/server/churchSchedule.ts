import "server-only";
import { createSupabaseChurchScheduleRepository } from "@/repositories/supabase/churchScheduleRepository";
import {
  createChurchScheduleService,
  type ChurchScheduleService,
} from "@/services/churchScheduleService";
import { getSupabaseServerClient } from "./supabase-server";

/** Programação da igreja no painel, com o client do usuário (RLS valendo). */
export async function getChurchScheduleService(): Promise<ChurchScheduleService> {
  return createChurchScheduleService(
    createSupabaseChurchScheduleRepository(await getSupabaseServerClient()),
  );
}
