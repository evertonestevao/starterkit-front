import "server-only";
import { createSupabaseModuloAtivoRepository } from "@/repositories/supabase/moduloAtivoRepository";
import { createModuloAtivoService, type ModuloAtivoService } from "@/services/moduloAtivoService";
import { getSupabaseServerClient } from "./supabase-server";

export async function getModuloAtivoService(): Promise<ModuloAtivoService> {
  return createModuloAtivoService(createSupabaseModuloAtivoRepository(await getSupabaseServerClient()));
}
