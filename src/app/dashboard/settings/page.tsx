import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AvatarForm,
  CompanyNameForm,
  LeaveCompanyButton,
  ProfileForm,
} from "@/features/companies/components/settings-forms";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { createUserService } from "@/services/userService";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null;

  const client = await getSupabaseServerClient();
  const profile = await createUserService(
    createSupabaseUserRepository(client),
  ).getMyProfile();

  const canEditCompany = permissionService.canEditCompany(active.role);
  const isOwner = active.role === "owner";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Configurações</h2>
        <p className="text-sm text-muted-foreground">Seu perfil e a empresa ativa</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Como seu nome aparece para colegas de empresa</CardDescription>
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
            <CardTitle>Empresa</CardTitle>
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
              Você perde o acesso aos dados desta empresa ao sair.
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
