import "server-only";
import { createSupabaseCargosRepository } from "@/repositories/supabase/cargosRepository";
import { createCargosService, type CargosService } from "@/services/cargosService";
import { getSupabaseServerClient } from "./supabase-server";

/** Catálogo de cargos sobre o client do usuário (RLS ativa). */
export async function getCargosService(): Promise<CargosService> {
  const client = await getSupabaseServerClient();
  return createCargosService(createSupabaseCargosRepository(client));
}
