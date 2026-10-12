import "server-only";
import { createSupabaseEbdRevistasRepository } from "@/repositories/supabase/ebdRevistasRepository";
import { createEbdRevistasService, type EbdRevistasActor } from "@/services/ebdRevistasService";
import { canGerirEbd } from "@/services/ebdService";
import { getEbdActorAutorizado } from "./ebd";
import { getSupabaseServerClient } from "./supabase-server";

/** Pedidos de revista da EBD, com o client do usuário (o banco confere a gestão da EBD). */
export async function getEbdRevistasService() {
  return createEbdRevistasService({ repo: createSupabaseEbdRevistasRepository(await getSupabaseServerClient()) });
}

/** Quem é da gestão da EBD na igreja ativa, ou null (a página responde 404). */
export async function getEbdRevistasActor(): Promise<EbdRevistasActor | null> {
  const actor = await getEbdActorAutorizado();
  if (!actor || !canGerirEbd(actor.role, actor.podeGerirEbd)) return null;
  return { role: actor.role, podeGerirEbd: actor.podeGerirEbd };
}
