import { createClient } from "@supabase/supabase-js";

export const admin = createClient(
  process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321",
  // Demo key pública e fixa do Supabase CLI, a mesma de playwright.config.ts.
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  { auth: { persistSession: false } },
);

export async function userIdByEmail(email: string): Promise<string> {
  const { data, error } = await admin.rpc("find_user_id_by_email", { p_email: email });
  if (error || !data) throw new Error(`Usuário não encontrado: ${email}`);
  return data as string;
}

export async function makeSuperAdmin(email: string) {
  const { error } = await admin.from("platform_admins").insert({ user_id: await userIdByEmail(email) });
  if (error) throw error;
}

export async function setModuleEnabled(enabled: boolean) {
  const { error } = await admin.from("reseller_settings").update({ resellers_enabled: enabled }).eq("singleton", true);
  if (error) throw error;
}

export async function setPlansAvailable(available: boolean) {
  const { error } = await admin.from("plans").update({ available_to_resellers: available }).neq("code", "free");
  if (error) throw error;
}

/** Devolve o estado global para as outras specs. */
export async function resetModule() {
  await setModuleEnabled(false);
  await setPlansAvailable(false);
}
