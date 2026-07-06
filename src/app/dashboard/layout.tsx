import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell, SIDEBAR_COOKIE } from "@/components/app-shell/app-shell";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { createUserService } from "@/services/userService";
import { TenantProvider } from "@/providers/tenant-provider";

/**
 * Layout autenticado: valida empresa ativa no servidor a cada request
 * (bloqueio de acesso sem empresa — plano §4) e hidrata o TenantProvider.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { companies, active } = await getActiveTenant();
  if (!active) {
    redirect("/onboarding");
  }

  const client = await getSupabaseServerClient();
  const [{ data: userData }, profile] = await Promise.all([
    client.auth.getUser(),
    createUserService(createSupabaseUserRepository(client)).getMyProfile(),
  ]);
  if (!userData.user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const initialCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "true";

  return (
    <TenantProvider value={{ companies, active }}>
      <AppShell
        initialCollapsed={initialCollapsed}
        userName={profile?.full_name ?? "Usuário"}
        userEmail={userData.user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
      >
        {children}
      </AppShell>
    </TenantProvider>
  );
}
