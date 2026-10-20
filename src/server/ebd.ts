import "server-only";
import { createSupabaseEbdRepository } from "@/repositories/supabase/ebdRepository";
import { canAcessarEbd, createEbdService, type EbdActor, type EbdService } from "@/services/ebdService";
import { getSupabaseServerClient } from "./supabase-server";
import { getActiveTenant } from "./tenant";

/** EBD sobre o client do usuário (RLS ativa). */
export async function getEbdService(): Promise<EbdService> {
  const client = await getSupabaseServerClient();
  return createEbdService({ repo: createSupabaseEbdRepository(client) });
}

/** Ator da empresa ativa, ou null quando não há empresa ativa. */
export async function getEbdActor(): Promise<EbdActor | null> {
  const { active } = await getActiveTenant();
  if (!active) return null;
  return {
    companyId: active.id,
    role: active.role,
    podeGerirEbd: active.pode_gerir_ebd,
    professorEbd: active.professor_ebd,
  };
}

/** Para as páginas: ator com acesso à EBD, ou null (a página responde 404). */
export async function getEbdActorAutorizado(): Promise<EbdActor | null> {
  const actor = await getEbdActor();
  return actor && canAcessarEbd(actor) ? actor : null;
}
