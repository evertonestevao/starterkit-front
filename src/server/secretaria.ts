import "server-only";
import { hojeISO } from "@/lib/acompanhamento";
import { createSupabaseSecretariaRepository } from "@/repositories/supabase/secretariaRepository";
import {
  canSecretaria,
  createSecretariaService,
  type SecretariaActor,
  type SecretariaService,
} from "@/services/secretariaService";
import { getSupabaseServerClient } from "./supabase-server";
import { getActiveTenant } from "./tenant";

/** Histórico e documentos do membro, sobre o client do usuário (RLS ativa). */
export async function getSecretariaService(): Promise<SecretariaService> {
  const client = await getSupabaseServerClient();
  return createSecretariaService({ repo: createSupabaseSecretariaRepository(client), hoje: hojeISO });
}

/** Ator autorizado (quem administra ou tem o módulo Membros), ou null. */
export async function getSecretariaActorAutorizado(): Promise<SecretariaActor | null> {
  const { active } = await getActiveTenant();
  if (!active) return null;
  const actor: SecretariaActor = {
    companyId: active.id,
    role: active.role,
    liberado: active.acessos.includes("membros"),
  };
  return canSecretaria(actor.role, actor.liberado) ? actor : null;
}
