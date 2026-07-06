import "server-only";
import { headers } from "next/headers";
import { createSupabaseTermsRepository } from "@/repositories/supabase/termsRepository";
import { createTermsService, type RequestEvidence, type TermsService } from "@/services/termsService";
import { getSupabaseServerClient } from "./supabase-server";

export async function getTermsService(): Promise<TermsService> {
  const client = await getSupabaseServerClient();
  return createTermsService(createSupabaseTermsRepository(client));
}

/** IP e user-agent da request atual — evidência LGPD do aceite. */
export async function getRequestEvidence(): Promise<RequestEvidence> {
  const headerList = await headers();
  // Atrás de proxy/CDN o IP real vem no primeiro item do x-forwarded-for.
  const forwardedFor = headerList.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() || headerList.get("x-real-ip") || null,
    userAgent: headerList.get("user-agent"),
  };
}
