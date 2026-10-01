import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "./supabase-server";

/** Rota que limpa uma sessão que não vale mais (ver app/auth/sessao-invalida). */
export const SESSAO_INVALIDA_PATH = "/auth/sessao-invalida";

/**
 * Usuário da sessão, conferido no servidor do Supabase (getUser), não só
 * pela assinatura do token.
 *
 * O proxy aceita o token só pela assinatura (getClaims, rápido). Um token
 * de conta que foi EXCLUÍDA continua bem assinado até expirar: o proxy acha
 * que a pessoa está logada e manda /login de volta para o painel, e o painel
 * falha. Sem esta checagem a pessoa fica presa, sem conseguir nem sair.
 */
export async function exigeUsuarioValido(): Promise<User> {
  const client = await getSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect(SESSAO_INVALIDA_PATH);
  return data.user;
}
