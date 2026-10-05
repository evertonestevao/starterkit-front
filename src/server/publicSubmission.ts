import "server-only";
import { createSupabasePublicSubmissionRepository } from "@/repositories/supabase/publicSubmissionRepository";
import {
  createPublicSubmissionService,
  type PublicSubmissionService,
} from "@/services/publicSubmissionService";
import { getSupabaseAdminClient } from "./supabase-admin";

/**
 * Envios da página pública. Gravam com o client de SERVIÇO: desde a
 * migration 20261005150000 a chave pública (anon) não escreve mais nessas
 * tabelas, para ninguém pular a validação e o limite de envios do site
 * mandando direto ao banco. Por isso a action chama `protegerEnvioPublico`
 * antes, e o repositório confere que a igreja existe.
 */
export async function getPublicSubmissionService(): Promise<PublicSubmissionService> {
  return createPublicSubmissionService(createSupabasePublicSubmissionRepository(getSupabaseAdminClient()));
}
