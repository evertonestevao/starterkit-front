"use server";

import { cookies } from "next/headers";
import { getAccountService } from "@/server/account";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { ACTIVE_COMPANY_COOKIE } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

/**
 * Exclusão da conta do usuário logado. Chamada imperativamente pelo client,
 * que navega para "/" no sucesso (ver nota em switchCompanyAction).
 */
export async function deleteAccountAction(confirmation: string): Promise<ActionState> {
  try {
    const account = await getAccountService();
    await account.deleteMyAccount({ confirmation });

    // O usuário já não existe: limpa a sessão local sem chamar o servidor de auth.
    const client = await getSupabaseServerClient();
    await client.auth.signOut({ scope: "local" });
    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_COMPANY_COOKIE);
    return { success: "Conta excluída" };
  } catch (err) {
    return toActionError(err);
  }
}
