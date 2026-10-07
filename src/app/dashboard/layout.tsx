import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell, SIDEBAR_COOKIE } from "@/components/app-shell/app-shell";
import { AvisoMensalidade, PainelSuspenso } from "@/features/church/components/aviso-mensalidade";
import { hojeISO } from "@/lib/acompanhamento";
import { montarAviso, montarBloqueio, pendenciaPrincipal } from "@/lib/mensalidadeAviso";
import { getMensalidadeBloqueada } from "@/server/mensalidadeBloqueio";
import { getChurchSelfPaymentService } from "@/server/churchSelfPayment";
import { createSupabaseInviteRepository } from "@/repositories/supabase/inviteRepository";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { createMemoryRateLimiter } from "@/server/rateLimit";
import { getCommunityService } from "@/server/community";
import { createInviteService } from "@/services/inviteService";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getSponsorService } from "@/server/sponsor";
import { getActiveTenant } from "@/server/tenant";
import { getMenusVisiveis } from "@/server/menuPermissoes";
import { isPlatformStaff } from "@/server/platform";
import { exigeUsuarioValido } from "@/server/session";
import { getTermsService } from "@/server/terms";
import { createUserService } from "@/services/userService";
import { NomesNiveisProvider } from "@/providers/niveis-provider";
import { TenantProvider } from "@/providers/tenant-provider";
import { getNomesNiveisDaEmpresa } from "@/server/niveisRede";
import { getSaudacaoDaEmpresa } from "@/server/saudacao";

/**
 * Layout autenticado: gate de termos vigentes (LGPD) + empresa ativa,
 * validados no servidor a cada request.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Antes de tudo: sessão de conta que não existe mais vai para a saída.
  await exigeUsuarioValido();
  const { companies, active } = await getActiveTenant();

  // Moderação da plataforma sem igreja não é uma igreja incompleta: é outra
  // pessoa. Checado ANTES do gate de termos porque os termos daqui são os das
  // igrejas, e quem modera não é parte desse contrato. Sem isto, o login
  // mandava a moderação aceitar termos de igreja e depois criar uma.
  if (!active && (await isPlatformStaff())) {
    redirect("/plataforma");
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

  // Quem não vê "Pedidos de oração" no menu (member sempre; a RLS também
  // não devolve nada para ele) não precisa da contagem — poupa a consulta.
  const unseenPrayerRequestsCount =
    active.role === "member" || !(await getMenusVisiveis()).includes("prayers")
      ? 0
      : await (await getCommunityService()).getUnseenPrayerCount(active.id).catch(() => 0);

  // Menus da pessoa: papel + o que os cargos dela liberam.
  const menus = await getMenusVisiveis();

  // Aviso no menu "Quem quer visita": pedidos em que ninguém fez contato
  // ainda. Só para quem tem o menu; se a contagem falhar, fica sem aviso.
  const visitasSemContato = menus.includes("relationships")
    ? await (
        await getCommunityService()
      )
        .countVisitas(active.id)
        .then((c) => c.novos)
        .catch(() => 0)
    : 0;

  // Mensalidade pendente. Durante a tolerância: aviso no topo, só para quem
  // administra a igreja (a situação financeira dela não é assunto de quem só
  // faz a chamada). Passada a tolerância: painel suspenso para todos, com a
  // explicação no lugar das telas. Se a consulta do detalhe falhar, o painel
  // segue sem o aviso (e a suspensão, com a mensagem genérica).
  const administra = active.role === "owner" || active.role === "admin";
  const suspenso = await getMensalidadeBloqueada();
  const pendencias = administra
    ? await (await getChurchSelfPaymentService()).pendencias(active.id).catch((err: unknown) => {
        console.error("[painel] falha ao verificar a mensalidade", err);
        return [];
      })
    : [];
  const pendencia = pendenciaPrincipal(pendencias);
  const variasIgrejas = pendencias.length > 1;
  const bloqueio = suspenso ? montarBloqueio(pendencia, administra, variasIgrejas) : null;
  const avisoMensalidade = !suspenso && pendencia ? montarAviso(pendencia, hojeISO(), variasIgrejas) : null;

  const cookieStore = await cookies();
  const initialCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "true";

  // Como a rede desta igreja chama os níveis (sede, subsede, congregação).
  const nomesNiveis = await getNomesNiveisDaEmpresa(active.id);
  const { saudacao } = await getSaudacaoDaEmpresa(active.id);

  return (
    <TenantProvider value={{ companies, active, menus, visitasSemContato, saudacao }}>
      <NomesNiveisProvider nomes={nomesNiveis}>
        <AppShell
          initialCollapsed={initialCollapsed}
          userName={profile?.full_name ?? "Usuário"}
          userEmail={userData.user.email ?? ""}
          avatarUrl={profile?.avatar_url ?? null}
          pendingInvitesCount={myInvites.length}
          unseenPrayerRequestsCount={unseenPrayerRequestsCount}
        >
          {avisoMensalidade ? <AvisoMensalidade aviso={avisoMensalidade} /> : null}
          {bloqueio ? <PainelSuspenso bloqueio={bloqueio}>{children}</PainelSuspenso> : children}
        </AppShell>
      </NomesNiveisProvider>
    </TenantProvider>
  );
}
