import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseInviteRepository } from "@/repositories/supabase/inviteRepository";
import { InviteMemberForm } from "@/features/companies/components/invite-member-form";
import { MembersList } from "@/features/companies/components/members-list";
import { PendingInvites } from "@/features/companies/components/pending-invites";
import { createMemoryRateLimiter } from "@/server/rateLimit";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant, getTenantService } from "@/server/tenant";
import { createInviteService } from "@/services/inviteService";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Membros" };

export default async function MembersPage() {
  const { active } = await getActiveTenant();
  if (!active) return null;
  // Autorização no servidor, não só no menu escondido.
  if (!permissionService.canManageMembers(active.role)) {
    redirect("/dashboard");
  }

  const client = await getSupabaseServerClient();
  const tenant = await getTenantService();
  const invites = createInviteService({
    repo: createSupabaseInviteRepository(client),
    rateLimiter: createMemoryRateLimiter({ limit: 1000, windowMs: 60_000 }),
  });

  const [members, pendingInvites] = await Promise.all([
    tenant.listMembers(active.id),
    invites.listPending(active.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Membros</h2>
        <p className="text-sm text-muted-foreground">
          Gerencie quem tem acesso a {active.name}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <MembersList members={members} />
          {pendingInvites.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-muted-foreground">Convites pendentes</h3>
              <PendingInvites invites={pendingInvites} />
            </section>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="size-4" />
              Convidar membro
            </CardTitle>
            <CardDescription>O convite expira em 7 dias e pode ser revogado.</CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
