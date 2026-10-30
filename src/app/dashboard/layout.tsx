import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell, SIDEBAR_COOKIE } from "@/components/app-shell/app-shell";
import { createSupabaseInviteRepository } from "@/repositories/supabase/inviteRepository";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { createMemoryRateLimiter } from "@/server/rateLimit";
import { createInviteService } from "@/services/inviteService";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { getTermsService } from "@/server/terms";
import { createUserService } from "@/services/userService";
import { getAreaLinks } from "@/modules/resellers/areaAccess";
import { TenantProvider } from "@/providers/tenant-provider";

/**
 * Layout autenticado: gate de termos vigentes (LGPD) + empresa ativa,
 * validados no servidor a cada request.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Sessão primeiro: sem ela o client vira anon, que não lê estas tabelas. Acontece
  // no re-render logo após excluir a conta, quando os cookies já foram limpos.
  const client = await getSupabaseServerClient();
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    redirect("/login");
  }

  // Termos primeiro: versão nova publicada força reaceite antes de qualquer
  // tela do dashboard (inclusive para quem entrou por convite).
  const terms = await getTermsService();
  if (!(await terms.hasAcceptedCurrent())) {
    redirect("/accept-terms");
  }

  const { companies, active } = await getActiveTenant();
  const areaLinks = await getAreaLinks();
  if (!active) {
    // Quem só tem outra área não precisa de empresa.
    redirect(areaLinks[0]?.href ?? "/onboarding");
  }

  const [profile, myInvites] = await Promise.all([
    createUserService(createSupabaseUserRepository(client)).getMyProfile(),
    createInviteService({
      repo: createSupabaseInviteRepository(client),
      rateLimiter: createMemoryRateLimiter({ limit: 1000, windowMs: 60_000 }),
    }).listMyPending(),
  ]);

  const cookieStore = await cookies();
  const initialCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "true";

  return (
    <TenantProvider value={{ companies, active }}>
      <AppShell
        initialCollapsed={initialCollapsed}
        userName={profile?.full_name ?? "Usuário"}
        userEmail={userData.user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
        pendingInvitesCount={myInvites.length}
        areaLinks={areaLinks}
      >
        {children}
      </AppShell>
    </TenantProvider>
  );
}
