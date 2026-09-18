import "server-only";
import { createSupabasePublicSubmissionRepository } from "@/repositories/supabase/publicSubmissionRepository";
import {
  createPublicSubmissionService,
  type PublicSubmissionService,
} from "@/services/publicSubmissionService";
import { getSupabaseServerClient } from "./supabase-server";

/** Envios da página pública, com o client de quem visita (anônimo, RLS valendo). */
export async function getPublicSubmissionService(): Promise<PublicSubmissionService> {
  return createPublicSubmissionService(
    createSupabasePublicSubmissionRepository(await getSupabaseServerClient()),
  );
}
