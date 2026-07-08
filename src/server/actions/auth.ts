"use server";

import { redirect } from "next/navigation";
import { getServerEnv } from "@/config/env";
import { createSupabaseAuthRepository } from "@/repositories/supabase/authRepository";
import { createRateLimiter } from "@/server/rateLimit";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { createAuthService } from "@/services/authService";
import { toActionError, type ActionState } from "./action-state";

/**
 * Server actions de autenticação: entrada única dos forms de auth.
 * Fluxo: action → authService (Zod + rate limit) → authRepository → Supabase.
 */

// Store escolhido por RATE_LIMIT_STORE (memory em dev, redis/Upstash em prod
// multi-instância) — ver src/server/rateLimit.ts.
const loginLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

async function getAuthService() {
  const client = await getSupabaseServerClient();
  return createAuthService({
    repo: createSupabaseAuthRepository(client),
    rateLimiter: loginLimiter,
    appUrl: getServerEnv().APP_URL,
  });
}

export async function signUpAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const next = formData.get("next");
  try {
    const auth = await getAuthService();
    await auth.signUp({
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
  } catch (err) {
    return toActionError(err);
  }
  // Preserva o destino (ex.: convidado voltando para /invites/accept).
  // Só caminho relativo interno — nunca URL absoluta (open redirect).
  const safeNext =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/onboarding";
  redirect(safeNext);
}

export async function signInAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const next = formData.get("next");
  try {
    const auth = await getAuthService();
    await auth.signIn({
      email: formData.get("email"),
      password: formData.get("password"),
    });
  } catch (err) {
    return toActionError(err);
  }
  // Só aceita caminho relativo interno — nunca URL absoluta (open redirect).
  const safeNext =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";
  redirect(safeNext);
}

export async function signOutAction(): Promise<void> {
  const auth = await getAuthService();
  await auth.signOut();
  redirect("/login");
}

export async function forgotPasswordAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const auth = await getAuthService();
    await auth.requestPasswordReset({ email: formData.get("email") });
  } catch (err) {
    return toActionError(err);
  }
  // Mesma resposta com email existente ou não: sem enumeração de contas.
  return { success: "Se o email existir, você receberá um link de recuperação." };
}

export async function resetPasswordAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const auth = await getAuthService();
    await auth.resetPassword({ password: formData.get("password") });
  } catch (err) {
    return toActionError(err);
  }
  redirect("/dashboard");
}
