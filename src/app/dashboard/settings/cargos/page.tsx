import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChurchLeadersManager } from "@/features/church/components/church-leaders-manager";
import { getChurchLeadersService } from "@/server/churchLeaders";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { canManageLeaders } from "@/services/churchLeadersService";

export const metadata: Metadata = { title: "Cargos da igreja" };

export default async function ChurchLeadersSettingsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou
  // Member não chega aqui nem pela URL; o service e a RLS recusam de novo.
  if (!canManageLeaders(active.role)) notFound();

  const { data } = await (await getSupabaseServerClient()).auth.getUser();
  if (!data.user) return null;

  const igrejas = await (await getChurchLeadersService()).listByCompany({
    companyId: active.id,
    role: active.role,
    userId: data.user.id,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cargos da igreja</CardTitle>
        <CardDescription>
          Quem é o pastor, o presbítero, o secretário. É só um registro para identificar as pessoas — a
          igreja superior vê o nome do Pastor na lista de igrejas ligadas. Estes dados aparecem apenas no
          painel, nunca na página pública.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {igrejas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma igreja nesta conta.</p>
        ) : (
          <ChurchLeadersManager igrejas={igrejas} />
        )}
      </CardContent>
    </Card>
  );
}
