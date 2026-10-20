import "server-only";
import { cache } from "react";
import type { NomesNiveis } from "@/lib/niveisRede";
import { createSupabaseNiveisRedeRepository } from "@/repositories/supabase/niveisRedeRepository";
import { createNiveisRedeService, type NiveisRedeService } from "@/services/niveisRedeService";
import { getSupabaseServerClient } from "./supabase-server";

export async function getNiveisRedeService(): Promise<NiveisRedeService> {
  return createNiveisRedeService(createSupabaseNiveisRedeRepository(await getSupabaseServerClient()));
}

/** Nomes dos níveis da rede de uma igreja. Uma consulta por igreja a cada pedido. */
export const getNomesNiveis = cache(async (churchId: string | null | undefined): Promise<NomesNiveis> => {
  return (await getNiveisRedeService()).nomesDaRede(churchId);
});

/** Os da igreja da empresa ativa (a primeira, quando a conta tem mais de uma). */
export const getNomesNiveisDaEmpresa = cache(async (companyId: string): Promise<NomesNiveis> => {
  const service = await getNiveisRedeService();
  return service.nomesDaRede((await service.igrejaDaEmpresa(companyId))?.id);
});
