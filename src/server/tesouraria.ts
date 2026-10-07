import "server-only";
import { hojeISO } from "@/lib/acompanhamento";
import { createSupabaseTesourariaRepository } from "@/repositories/supabase/tesourariaRepository";
import {
  canTesouraria,
  createTesourariaService,
  type TesourariaActor,
  type TesourariaService,
} from "@/services/tesourariaService";
import { getSupabaseServerClient } from "./supabase-server";
import { getActiveTenant } from "./tenant";

/** Tesouraria sobre o client do usuário (RLS ativa). */
export async function getTesourariaService(): Promise<TesourariaService> {
  const client = await getSupabaseServerClient();
  return createTesourariaService({ repo: createSupabaseTesourariaRepository(client), hoje: hojeISO });
}

/** Para as páginas e actions: ator autorizado, ou null (a página responde 404). */
export async function getTesourariaActorAutorizado(): Promise<TesourariaActor | null> {
  const { active } = await getActiveTenant();
  if (!active) return null;
  const actor: TesourariaActor = {
    companyId: active.id,
    role: active.role,
    liberado: active.acessos.includes("tesouraria"),
  };
  return canTesouraria(actor.role, actor.liberado) ? actor : null;
}
