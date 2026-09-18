import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell, SIDEBAR_COOKIE } from "@/components/app-shell/app-shell";
import { createSupabaseInviteRepository } from "@/repositories/supabase/inviteRepository";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { createMemoryRateLimiter } from "@/server/rateLimit";
import { createInviteService } from "@/services/inviteService";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getSponsorService } from "@/server/sponsor";
import { getActiveTenant } from "@/server/tenant";
import { isPlatformStaff } from "@/server/platform";
import { getTermsService } from "@/server/terms";
import { createUserService } from "@/services/userService";
import { TenantProvider } from "@/providers/tenant-provider";

/**
 * Layout autenticado: gate de termos vigentes (LGPD) + empresa ativa,
 * validados no servidor a cada request.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { companies, active } = await getActiveTenant();

  // Moderação da plataforma sem igreja não é uma igreja incompleta: é outra
  // pessoa. Checado ANTES do gate de termos porque os termos daqui são os das
  // igrejas, e quem modera não é parte desse contrato. Sem isto, o login
  // mandava a moderação aceitar termos de igreja e depois criar uma.
  if (!active && (await isPlatformStaff())) {
    redirect("/plataforma/alteracoes");
  }

  // Termos: versão nova publicada força reaceite antes de qualquer tela do
  // dashboard (inclusive para quem entrou por convite).
  const terms = await getTermsService();
  if (!(await terms.hasAcceptedCurrent("igreja"))) {
    redirect("/accept-terms");
  }

  if (!active) {
    // Patrocinador não tem empresa. Mandá-lo para o onboarding ("crie sua
    // empresa") é um beco sem saída — acontece quando ele entra por /login
    // ou volta de uma redefinição de senha.
    if (await (await getSponsorService()).getMyAccount()) {
      redirect("/patrocinador");
    }
    redirect("/onboarding");
  }

  const client = await getSupabaseServerClient();
  const [{ data: userData }, profile, myInvites] = await Promise.all([
    client.auth.getUser(),
    createUserService(createSupabaseUserRepository(client)).getMyProfile(),
    createInviteService({
      repo: createSupabaseInviteRepository(client),
      rateLimiter: createMemoryRateLimiter({ limit: 1000, windowMs: 60_000 }),
    }).listMyPending(),
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
        pendingInvitesCount={myInvites.length}
      >
        {children}
      </AppShell>
    </TenantProvider>
  );
}
