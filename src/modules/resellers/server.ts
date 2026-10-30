import "server-only";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { reportError } from "@/adapters/errorReporting";
import { getServerEnv } from "@/config/env";
import { getSupabaseAdminClient } from "@/server/supabase-admin";
import { getSupabaseServerClient } from "@/server/supabase-server";
import {
  buildReferralCookie,
  buildReferralRedirect,
  normalizeReferralCode,
  REFERRAL_COOKIE,
} from "./referralCookie";
import { createCommissionService, type CommissionService } from "./commissionService";
import { createReferralService, type ReferralService } from "./referralService";
import { createSupabaseCommissionRepository } from "./supabaseCommissionRepository";
import { createSupabaseReferralRepository } from "./supabaseReferralRepository";

/**
 * Pontos de entrada do módulo no servidor. service_role só aqui: as funções do link
 * são fechadas para o client, e o visitante do anúncio nem tem sessão.
 */

// Por instância: o cache da validação precisa sobreviver entre requests.
let referralService: ReferralService | undefined;

function getReferralService(): ReferralService {
  referralService ??= createReferralService({
    repo: createSupabaseReferralRepository(getSupabaseAdminClient()),
  });
  return referralService;
}

/**
 * GET /r/[codigo]. Código válido ou não, a resposta é o mesmo redirecionamento; só o
 * cookie muda. Location relativo: funciona atrás de proxy, sem depender do host.
 */
export async function handleReferralClick(
  request: NextRequest,
  code: string,
): Promise<Response> {
  const headers = new Headers({
    Location: buildReferralRedirect(request.nextUrl.searchParams),
    "Cache-Control": "no-store",
  });

  const cookieCode = await getReferralService().resolveClick({
    code,
    existingCookie: request.cookies.get(REFERRAL_COOKIE)?.value,
  });
  if (cookieCode) {
    const secure = new URL(getServerEnv().APP_URL).protocol === "https:";
    headers.append("Set-Cookie", buildReferralCookie(cookieCode, secure));
  }

  return new Response(null, { status: 307, headers });
}

export function getCommissionService(): CommissionService {
  return createCommissionService(createSupabaseCommissionRepository(getSupabaseAdminClient()));
}

/**
 * Vínculo na contratação: grava a indicação do cookie, se ainda não houver, e vincula
 * se a empresa nunca pagou e o plano está liberado. Falha aqui nunca impede a compra.
 */
export async function linkCompanyAtCheckout(companyId: string, planId: string): Promise<void> {
  try {
    const cookieStore = await cookies();
    const client = await getSupabaseServerClient();
    const { data } = await client.auth.getUser();
    if (!data.user) return;

    const { error } = await getSupabaseAdminClient().rpc("link_company_at_checkout", {
      p_company_id: companyId,
      p_referral_code: normalizeReferralCode(cookieStore.get(REFERRAL_COOKIE)?.value),
      p_user_id: data.user.id,
      p_plan_id: planId,
    });
    if (error) throw error;
  } catch (err) {
    await reportError(err, { source: "resellers:linkCompanyAtCheckout" });
  }
}

/** Encerra o vínculo quando a própria empresa cancela. Nunca impede o cancelamento. */
export async function endCompanyResellerLink(companyId: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdminClient().rpc("end_reseller_client", {
      p_company_id: companyId,
    });
    if (error) throw error;
  } catch (err) {
    await reportError(err, { source: "resellers:endCompanyResellerLink" });
  }
}

/** Grava a indicação na empresa recém-criada. Falha aqui nunca impede o cadastro. */
export async function recordCompanyReferralFromCookie(companyId: string): Promise<void> {
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(REFERRAL_COOKIE)?.value;
    if (!cookieValue) return;

    const client = await getSupabaseServerClient();
    const { data } = await client.auth.getUser();
    if (!data.user) return;

    await getReferralService().recordForCompany({
      companyId,
      userId: data.user.id,
      cookieValue,
    });
  } catch (err) {
    await reportError(err, { source: "resellers:recordCompanyReferral" });
  }
}
