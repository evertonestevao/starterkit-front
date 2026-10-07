import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseStorageProvider } from "@/adapters/storage/supabaseStorageProvider";
import { hojeISO } from "@/lib/acompanhamento";
import { createSupabaseCarteirinhaRepository } from "@/repositories/supabase/carteirinhaRepository";
import {
  canCarteirinha,
  createCarteirinhaService,
  type CarteirinhaActor,
  type CarteirinhaService,
} from "@/services/carteirinhaService";
import { CHURCH_LOGOS_BUCKET } from "./churchProfile";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import { getActiveTenant } from "./tenant";
import { hashUrlToken, makeUrlToken } from "./tokens";

/** Bucket PRIVADO, sem policy: só este servidor (service_role) lê e escreve. */
const FOTOS_BUCKET = "membros-fotos";

/**
 * Consentimento, foto e carteirinha. Os dados passam pelo client de quem pede
 * (RLS ativa; anônimo nas páginas do link e do QR). O `service_role` entra em
 * dois pontos só: o bucket das fotos e a busca da foto pelo link pessoal —
 * sempre depois de o service conferir o acesso ou o link.
 */
export async function getCarteirinhaService(): Promise<CarteirinhaService> {
  const client = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  return createCarteirinhaService({
    repo: createSupabaseCarteirinhaRepository(client, admin),
    storage: createSupabaseStorageProvider(admin, FOTOS_BUCKET),
    logos: createSupabaseStorageProvider(admin, CHURCH_LOGOS_BUCKET),
    tokens: { make: makeUrlToken, hash: hashUrlToken },
    novoId: randomUUID,
    hoje: hojeISO,
  });
}

/** Ator autorizado (quem administra ou tem o módulo Membros), ou null. */
export async function getCarteirinhaActorAutorizado(): Promise<CarteirinhaActor | null> {
  const { active } = await getActiveTenant();
  if (!active) return null;
  const actor: CarteirinhaActor = {
    companyId: active.id,
    role: active.role,
    liberado: active.acessos.includes("membros"),
  };
  return canCarteirinha(actor.role, actor.liberado) ? actor : null;
}
