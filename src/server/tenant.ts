import "server-only";
import { cookies } from "next/headers";
import { createSupabaseTenantRepository } from "@/repositories/supabase/tenantRepository";
import { createTenantService, type TenantService } from "@/services/tenantService";
import type { CompanyWithRole } from "@/types/tenant";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Empresa ativa por request. O id fica num cookie, mas o cookie é só
 * preferência de UI: a cada request a membership é revalidada via RLS —
 * cookie apontando para empresa alheia simplesmente não resolve.
 */

export const ACTIVE_COMPANY_COOKIE = "active-company";

export async function getTenantService(): Promise<TenantService> {
  const client = await getSupabaseServerClient();
  return createTenantService(createSupabaseTenantRepository(client));
}

export interface ActiveTenant {
  companies: CompanyWithRole[];
  active: CompanyWithRole | null;
}

/** Empresas do usuário + a ativa (cookie válido, senão a primeira). */
export async function getActiveTenant(): Promise<ActiveTenant> {
  const tenant = await getTenantService();
  const companies = await tenant.listMyCompanies();
  if (companies.length === 0) {
    return { companies, active: null };
  }

  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;
  const active = companies.find((c) => c.id === preferred) ?? companies[0];
  return { companies, active };
}
