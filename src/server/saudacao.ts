import "server-only";
import { cache } from "react";
import { SAUDACAO_PADRAO } from "@/lib/saudacao";
import { createSupabaseSaudacaoRepository } from "@/repositories/supabase/saudacaoRepository";
import { createSaudacaoService, type SaudacaoService } from "@/services/saudacaoService";
import { getSupabaseServerClient } from "./supabase-server";
import { getActiveTenant } from "./tenant";

export async function getSaudacaoService(): Promise<SaudacaoService> {
  return createSaudacaoService(createSupabaseSaudacaoRepository(await getSupabaseServerClient()));
}

/** Saudação (e a igreja) da empresa. Uma consulta por empresa a cada pedido. */
export const getSaudacaoDaEmpresa = cache(async (companyId: string) => {
  return (await getSaudacaoService()).daEmpresa(companyId);
});

/** A da igreja ativa, para as páginas que montam mensagens prontas. */
export async function getSaudacaoAtiva(): Promise<string> {
  const { active } = await getActiveTenant();
  return active ? (await getSaudacaoDaEmpresa(active.id)).saudacao : SAUDACAO_PADRAO;
}
