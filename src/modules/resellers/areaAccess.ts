import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SIDEBAR_COOKIE } from "@/components/app-shell/app-shell";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getTermsService } from "@/server/terms";
import { createUserService } from "@/services/userService";

/**
 * Quem acessa cada área. Vem sempre do banco (platform_admins e resellers, pela view
 * reseller_me), nunca de metadados do usuário, que ele mesmo pode editar.
 */

export interface AreaLink {
  href: string;
  label: string;
}

export async function getResellerRoles() {
  const client = await getSupabaseServerClient();
  const [{ data: isSuperAdmin }, { data: me }] = await Promise.all([
    client.rpc("is_super_admin"),
    client.from("reseller_me").select("id").maybeSingle(),
  ]);
  return { isSuperAdmin: isSuperAdmin === true, isReseller: Boolean(me) };
}

/** Links de troca de área no menu do usuário. */
export async function getAreaLinks(): Promise<AreaLink[]> {
  const { isSuperAdmin, isReseller } = await getResellerRoles();
  return [
    ...(isReseller ? [{ href: "/vendedor", label: "Área do vendedor" }] : []),
    ...(isSuperAdmin ? [{ href: "/admin/revendedores", label: "Revendedores" }] : []),
  ];
}

/** Sessão, termos vigentes e dados do shell, comuns às duas áreas. */
export async function getAreaShellProps() {
  const client = await getSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/login");

  const terms = await getTermsService();
  if (!(await terms.hasAcceptedCurrent())) redirect("/accept-terms");

  const profile = await createUserService(createSupabaseUserRepository(client)).getMyProfile();
  const cookieStore = await cookies();
  return {
    initialCollapsed: cookieStore.get(SIDEBAR_COOKIE)?.value === "true",
    userName: profile?.full_name ?? "Usuário",
    userEmail: data.user.email ?? "",
    avatarUrl: profile?.avatar_url ?? null,
  };
}

/** Portão das páginas do painel. Layout sozinho não basta: toda página chama. */
export async function requireSuperAdminPage() {
  const { isSuperAdmin } = await getResellerRoles();
  if (!isSuperAdmin) redirect("/dashboard");
}
