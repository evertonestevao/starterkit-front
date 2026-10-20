import "server-only";
import { cache } from "react";
import { formatChurchName } from "@/lib/churchName";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Nome completo da igreja de uma conta, com o complemento ("Assembleia de
 * Deus no Ipiranga · Lins"). Sem igreja (ou erro), devolve o nome da conta.
 */
export const nomeCompletoDaIgreja = cache(async (companyId: string, padrao: string): Promise<string> => {
  const { data, error } = await (await getSupabaseServerClient())
    .from("churches")
    .select("name, sobrenome")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle<{ name: string; sobrenome: string | null }>();
  if (error || !data) return padrao;
  return formatChurchName(data.name, data.sobrenome);
});
