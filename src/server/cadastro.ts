import "server-only";
import { cache } from "react";
import { getServerEnv } from "@/config/env";
import { createSupabaseCadastroConviteRepository } from "@/repositories/supabase/cadastroConviteRepository";
import { createCadastroConviteService } from "@/services/cadastroConviteService";
import { getSupabaseServerClient } from "./supabase-server";
import { hashUrlToken, makeUrlToken } from "./tokens";

/**
 * Cadastro aberto ou só por convite (Configurações da plataforma). O banco é
 * quem trava de verdade (create_company_with_church); aqui é para a tela
 * mostrar o caminho certo. Na dúvida (erro), trata como fechado.
 */
export const cadastroAberto = cache(async (): Promise<boolean> => {
  const { data, error } = await (await getSupabaseServerClient()).rpc("cadastro_aberto");
  if (error) {
    console.error("[cadastro] falha ao ler se o cadastro está aberto", error);
    return false;
  }
  return data === true;
});

/** O convite de igreja nova (gerado pela plataforma) ainda vale? */
export async function conviteIgrejaValido(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return false;
  const { data, error } = await (
    await getSupabaseServerClient()
  ).rpc("convite_igreja_valido", {
    p_token_hash: hashUrlToken(token),
  });
  if (error) {
    console.error("[cadastro] falha ao conferir o convite de igreja", error);
    return false;
  }
  return data === true;
}

/** Painel da plataforma: interruptor do cadastro e convites de igreja nova. */
export async function getCadastroConviteService() {
  return createCadastroConviteService({
    repo: createSupabaseCadastroConviteRepository(await getSupabaseServerClient()),
    tokens: { make: makeUrlToken, hash: hashUrlToken },
    appUrl: getServerEnv().APP_URL,
  });
}
