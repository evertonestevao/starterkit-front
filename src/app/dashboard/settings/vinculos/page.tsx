import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildNetwork } from "@/lib/churchNetwork";
import { ChurchLinksManager } from "@/features/church/components/church-links-manager";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getChurchLinkService } from "@/server/churchLinks";
import { getActiveTenant } from "@/server/tenant";
import { canManageChurchLinks } from "@/services/churchLinkService";

export const metadata: Metadata = { title: "Vínculos entre igrejas" };

export default async function ChurchLinksSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ igreja?: string }>;
}) {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou
  if (!canManageChurchLinks(active.role)) notFound();

  const { data } = await (await getSupabaseServerClient()).auth.getUser();
  if (!data.user) return null;
  const actor = { companyId: active.id, role: active.role, userId: data.user.id };

  const service = await getChurchLinkService();
  const churches = await service.listChurches(actor);
  const { igreja } = await searchParams;
  const escolhida = churches.find((c) => c.id === igreja) ?? churches[0];
  if (!escolhida) return <p className="text-sm text-muted-foreground">Nenhuma igreja nesta conta.</p>;

  const overview = await service.overview(actor, escolhida.id);

  return (
    <ChurchLinksManager
      church={overview.church}
      churches={churches}
      parent={overview.parent}
      entries={buildNetwork(overview.children, overview.congregacoesPorIgreja)}
      invites={overview.invites}
      incomingPending={overview.incomingPending}
      myPending={overview.myPending}
      history={overview.history}
      canInvite={overview.canInvite}
    />
  );
}
