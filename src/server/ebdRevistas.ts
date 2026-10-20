import "server-only";
import { cache } from "react";
import { createSupabaseEbdRevistasRepository } from "@/repositories/supabase/ebdRevistasRepository";
import { createEbdRevistasService, type EbdRevistasActor } from "@/services/ebdRevistasService";
import { canGerirEbd } from "@/services/ebdService";
import { getEbdActorAutorizado } from "./ebd";
import { getSupabaseServerClient } from "./supabase-server";
import { getActiveTenant } from "./tenant";

/** Pedidos de revista da EBD, com o client do usuário (o banco confere a gestão da EBD). */
export async function getEbdRevistasService() {
  return createEbdRevistasService({ repo: createSupabaseEbdRevistasRepository(await getSupabaseServerClient()) });
}

/**
 * A igreja dos pedidos: a da conta ativa. Vem sempre da sessão, nunca do
 * formulário (o banco confere de novo que quem pede é da gestão da EBD dela).
 */
export const getIgrejaDosPedidos = cache(async (): Promise<{ id: string; tipo: string } | null> => {
  const { active } = await getActiveTenant();
  if (!active) return null;
  const { data, error } = await (
    await getSupabaseServerClient()
  )
    .from("churches")
    .select("id, tipo")
    .eq("company_id", active.id)
    .is("deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle<{ id: string; tipo: string }>();
  if (error) {
    console.error("[revistas] falha ao carregar a igreja ativa", error);
    return null;
  }
  return data;
});

/** Quem é da gestão da EBD na igreja ativa, ou null (a página responde 404). */
export async function getEbdRevistasActor(): Promise<EbdRevistasActor | null> {
  const actor = await getEbdActorAutorizado();
  if (!actor || !canGerirEbd(actor.role, actor.podeGerirEbd)) return null;
  return { role: actor.role, podeGerirEbd: actor.podeGerirEbd };
}
