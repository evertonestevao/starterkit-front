import "server-only";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { createSupabaseChurchProfileRepository } from "@/repositories/supabase/churchProfileRepository";
import { createAuditService } from "@/services/auditService";
import {
  createChurchProfileService,
  type ChurchProfileService,
} from "@/services/churchProfileService";
import { getSupabaseServerClient } from "./supabase-server";

/** Bucket do logo da igreja (público para leitura; escrita só de quem administra). */
export const CHURCH_LOGOS_BUCKET = "church-logos";

export async function getChurchProfileService(): Promise<ChurchProfileService> {
  const client = await getSupabaseServerClient();
  return createChurchProfileService({
    repo: createSupabaseChurchProfileRepository(client),
    audit: createAuditService(createSupabaseAuditRepository(client)),
  });
}
