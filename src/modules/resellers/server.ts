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
  REFERRAL_COOKIE,
} from "./referralCookie";
import { createReferralService, type ReferralService } from "./referralService";
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
