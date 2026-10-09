import "server-only";
import { cache } from "react";
import { getServerEnv } from "@/config/env";
import {
  createSupabaseContasDoServidor,
  createSupabaseRedeCadastroRepository,
} from "@/repositories/supabase/redeCadastroRepository";
import {
  createAssumirService,
  createRedeCadastroService,
  podeCadastrarNaRede,
  type RedeCadastroActor,
} from "@/services/redeCadastroService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import { getActiveTenant } from "./tenant";
import { hashUrlToken, makeUrlToken } from "./tokens";

/** Cadastro de igrejas pela rede, com o client do usuário (o banco confere a permissão). */
export async function getRedeCadastroService() {
  return createRedeCadastroService({
    repo: createSupabaseRedeCadastroRepository(await getSupabaseServerClient()),
    tokens: { make: makeUrlToken, hash: hashUrlToken },
    appUrl: getServerEnv().APP_URL,
  });
}

/** Ator autorizado a cadastrar igrejas na rede, ou null. */
export async function getRedeCadastroActor(): Promise<RedeCadastroActor | null> {
  const { active } = await getActiveTenant();
  if (!active) return null;
  const liberado = active.acessos.includes("rede_cadastro");
  if (!podeCadastrarNaRede(active.role, liberado)) return null;
  const { data } = await (await getSupabaseServerClient()).auth.getUser();
  if (!data.user) return null;
  return { companyId: active.id, role: active.role, liberado, userId: data.user.id };
}

/**
 * A página do link para assumir. O service_role entra só para conferir se o
 * e-mail tem conta e criar a conta no primeiro acesso.
 */
export async function getAssumirService() {
  const client = await getSupabaseServerClient();
  return createAssumirService({
    repo: createSupabaseRedeCadastroRepository(client),
    contas: createSupabaseContasDoServidor(getSupabaseAdminClient(), client),
  });
}

/**
 * A igreja da conta ativa, se quem está logado pode cadastrar igrejas abaixo
 * dela: tem a permissão e ela não é congregação (congregação não tem igrejas
 * abaixo). Null nos outros casos. Uma consulta por request.
 */
export const getIgrejaQueCadastra = cache(
  async (): Promise<{ id: string; name: string; tipo: string; parentId: string | null } | null> => {
    const actor = await getRedeCadastroActor();
    if (!actor) return null;
    const { data, error } = await (await getSupabaseServerClient())
      .from("churches")
      .select("id, name, tipo, parent_id")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("created_at")
      .limit(1)
      .maybeSingle<{ id: string; name: string; tipo: string; parent_id: string | null }>();
    if (error) {
      console.error("[rede] falha ao carregar a igreja que cadastra", error);
      return null;
    }
    if (!data || data.tipo === "congregacao") return null;
    return { id: data.id, name: data.name, tipo: data.tipo, parentId: data.parent_id };
  },
);
