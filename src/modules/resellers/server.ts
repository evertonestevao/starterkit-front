import "server-only";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { reportError } from "@/adapters/errorReporting";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import type { MyDataExport } from "@/types/account";
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
    clientKey:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "desconhecido",
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

/**
 * Por user_id e com service_role, não pelas views: vendedor suspenso não enxerga nada
 * nelas, e ainda assim tem direito de exportar os dados e não pode excluir com pendência.
 */
async function findResellerByUser(userId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("resellers")
    .select("id, name, email, referral_code, status")
    .eq("user_id", userId)
    .maybeSingle<{ id: string; name: string; email: string; referral_code: string; status: string }>();
  if (error) throw new AppError("internal_error", "Falha ao consultar o cadastro de vendedor", error);
  return data;
}

export async function getResellerDeletionBlockers(userId: string): Promise<string[]> {
  const reseller = await findResellerByUser(userId);
  if (!reseller) return [];
  const { count, error } = await getSupabaseAdminClient()
    .from("reseller_commissions")
    .select("id", { count: "exact", head: true })
    .eq("reseller_id", reseller.id)
    .eq("status", "pending")
    .is("deleted_at", null);
  if (error) throw new AppError("internal_error", "Falha ao consultar comissões", error);
  return count
    ? ["Você tem comissões pendentes de recebimento. Fale com o administrador para quitá-las antes de excluir a conta."]
    : [];
}

export async function getResellerExportData(userId: string): Promise<Partial<MyDataExport>> {
  const reseller = await findResellerByUser(userId);
  if (!reseller) return {};
  const admin = getSupabaseAdminClient();
  const [clients, commissions] = await Promise.all([
    admin
      .from("reseller_clients")
      .select("sale_number, started_at, ended_at, company:companies!inner(name)")
      .eq("reseller_id", reseller.id),
    admin
      .from("reseller_commissions")
      .select("base_amount_cents, amount_cents, status, created_at, paid_at, company:companies!inner(name)")
      .eq("reseller_id", reseller.id),
  ]);
  if (clients.error || commissions.error) {
    throw new AppError("internal_error", "Falha ao exportar dados de revenda", clients.error ?? commissions.error);
  }
  const companyName = (company: unknown) => (company as { name: string }).name;
  return {
    reseller: {
      name: reseller.name,
      email: reseller.email,
      referralCode: reseller.referral_code,
      status: reseller.status,
      clients: clients.data.map((client) => ({
        clientName: companyName(client.company),
        saleNumber: client.sale_number,
        startedAt: client.started_at,
        endedAt: client.ended_at,
      })),
      commissions: commissions.data.map((commission) => ({
        clientName: companyName(commission.company),
        baseAmountCents: commission.base_amount_cents,
        amountCents: commission.amount_cents,
        status: commission.status,
        createdAt: commission.created_at,
        paidAt: commission.paid_at,
      })),
    },
  };
}
