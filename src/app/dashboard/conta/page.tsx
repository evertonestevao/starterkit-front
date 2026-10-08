import type { Metadata } from "next";
import { BellRing } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlterarSenhaForm } from "@/features/auth/components/alterar-senha-form";
import { AcceptInviteButton } from "@/features/companies/components/accept-invite-button";
import { AvatarForm, LeaveCompanyButton, ProfileForm } from "@/features/companies/components/settings-forms";
import { PAPEL_LABEL } from "@/lib/papeis";
import { createSupabaseInviteRepository } from "@/repositories/supabase/inviteRepository";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { createMemoryRateLimiter } from "@/server/rateLimit";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { createInviteService } from "@/services/inviteService";
import { createUserService } from "@/services/userService";

export const metadata: Metadata = { title: "Minha conta" };

/**
 * A conta de quem está logado: foto, nome, convites recebidos e sair da
 * igreja. Abre pelo menu do perfil (canto superior direito) — o menu da
 * esquerda é só do que é da igreja.
 */
export default async function ContaPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou

  const client = await getSupabaseServerClient();
  const [profile, myInvites] = await Promise.all([
    createUserService(createSupabaseUserRepository(client)).getMyProfile(),
    createInviteService({
      repo: createSupabaseInviteRepository(client),
      rateLimiter: createMemoryRateLimiter({ limit: 1000, windowMs: 60_000 }),
    }).listMyPending(),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Minha conta</h2>
        <p className="text-sm text-muted-foreground">Sua foto, seu nome e as igrejas em que você entra</p>
      </div>

      {/* Convites endereçados a MIM (outras igrejas me chamando). */}
      {myInvites.length > 0 ? (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="size-4 text-primary" />
              Convites pendentes para você
              <Badge>{myInvites.length}</Badge>
            </CardTitle>
            <CardDescription>Você foi convidado para outras igrejas. Aceite para entrar nelas.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {myInvites.map((invite) => (
              <div key={invite.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{invite.company_name}</p>
                  <p className="text-xs text-muted-foreground">
                    papel: {PAPEL_LABEL[invite.role]} · expira em{" "}
                    {new Date(invite.expires_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="ml-auto w-full sm:w-auto">
                  <AcceptInviteButton token={invite.token} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Como seu nome aparece para colegas de igreja</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AvatarForm initialAvatarUrl={profile?.avatar_url ?? null} userName={profile?.full_name ?? ""} />
          <ProfileForm initialName={profile?.full_name ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Senha</CardTitle>
          <CardDescription>
            Para trocar, confirme a senha atual. Esqueceu? Saia e use &quot;Esqueci minha senha&quot; na tela de
            entrada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlterarSenhaForm />
        </CardContent>
      </Card>

      {/* O Responsável não sai: antes passa o papel adiante, na ficha de outro membro. */}
      {active.role !== "owner" ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Sair desta igreja</CardTitle>
            <CardDescription>Você perde o acesso aos dados de {active.name} ao sair.</CardDescription>
          </CardHeader>
          <CardContent>
            <LeaveCompanyButton />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
