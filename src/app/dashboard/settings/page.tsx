import type { Metadata } from "next";
import { PAPEL_LABEL } from "@/lib/papeis";
import { BellRing } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptInviteButton } from "@/features/companies/components/accept-invite-button";
import {
  AvatarForm,
  CompanyNameForm,
  LeaveCompanyButton,
  ProfileForm,
} from "@/features/companies/components/settings-forms";
import { createSupabaseInviteRepository } from "@/repositories/supabase/inviteRepository";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { createMemoryRateLimiter } from "@/server/rateLimit";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { createInviteService } from "@/services/inviteService";
import { createUserService } from "@/services/userService";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null;

  const client = await getSupabaseServerClient();
  const [profile, myInvites] = await Promise.all([
    createUserService(createSupabaseUserRepository(client)).getMyProfile(),
    createInviteService({
      repo: createSupabaseInviteRepository(client),
      rateLimiter: createMemoryRateLimiter({ limit: 1000, windowMs: 60_000 }),
    }).listMyPending(),
  ]);

  const canEditCompany = permissionService.canEditCompany(active.role);
  const isOwner = active.role === "owner";

  // Título e abas vivem no layout: aqui fica só o conteúdo da aba "Geral".
  return (
    <div className="flex flex-col gap-6">
      {/* Convites endereçados a MIM (outras empresas me chamando). */}
      {myInvites.length > 0 ? (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="size-4 text-primary" />
              Convites pendentes para você
              <Badge>{myInvites.length}</Badge>
            </CardTitle>
            <CardDescription>
              Você foi convidado para outras igrejas. Aceite para entrar nelas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {myInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              >
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
          <AvatarForm
            initialAvatarUrl={profile?.avatar_url ?? null}
            userName={profile?.full_name ?? ""}
          />
          <ProfileForm initialName={profile?.full_name ?? ""} />
        </CardContent>
      </Card>

      {canEditCompany ? (
        <Card>
          <CardHeader>
            <CardTitle>Igreja</CardTitle>
            <CardDescription>Dados de {active.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyNameForm />
          </CardContent>
        </Card>
      ) : null}

      {!isOwner ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Zona de perigo</CardTitle>
            <CardDescription>
              Você perde o acesso aos dados desta igreja ao sair.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LeaveCompanyButton />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
