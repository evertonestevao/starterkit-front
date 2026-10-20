import "server-only";
import { createSupabaseAcompanhamentoRepository } from "@/repositories/supabase/acompanhamentoRepository";
import {
  canAcompanhar,
  createAcompanhamentoService,
  type AcompanhamentoActor,
  type AcompanhamentoService,
} from "@/services/acompanhamentoService";
import { getSupabaseServerClient } from "./supabase-server";
import { getActiveTenant } from "./tenant";

/** Chamada e Acompanhamento sobre o client do usuário (RLS ativa). */
export async function getAcompanhamentoService(): Promise<AcompanhamentoService> {
  const client = await getSupabaseServerClient();
  return createAcompanhamentoService({ repo: createSupabaseAcompanhamentoRepository(client) });
}

/** Ator da empresa ativa, ou null quando não há empresa ativa. */
export async function getAcompanhamentoActor(): Promise<AcompanhamentoActor | null> {
  const { active } = await getActiveTenant();
  if (!active) return null;
  return { companyId: active.id, role: active.role, podeAcompanhar: active.pode_acompanhar };
}

/** Para as páginas: ator autorizado, ou null (a página responde 404). */
export async function getAcompanhamentoActorAutorizado(): Promise<AcompanhamentoActor | null> {
  const actor = await getAcompanhamentoActor();
  if (!actor || !canAcompanhar(actor.role, actor.podeAcompanhar)) return null;
  return actor;
}
