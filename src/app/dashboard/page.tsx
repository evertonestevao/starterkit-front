import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Mail, ShieldCheck, Users } from "lucide-react";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { DonutChartCard } from "@/components/charts/donut-chart-card";
import { LineChartCard } from "@/components/charts/line-chart-card";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { createSupabaseInviteRepository } from "@/repositories/supabase/inviteRepository";
import { createMemoryRateLimiter } from "@/server/rateLimit";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant, getTenantService } from "@/server/tenant";
import { createBillingService } from "@/services/billingService";
import { createInviteService } from "@/services/inviteService";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou

  const client = await getSupabaseServerClient();
  const tenant = await getTenantService();
  const billing = createBillingService(createSupabaseBillingRepository(client));
  const isAdmin = permissionService.canManageMembers(active.role);

  const [members, plan, pendingInvites] = await Promise.all([
    // pageSize mínimo: aqui só o total interessa (métrica), não as linhas.
    tenant.listMembers(active.id, { page: 1, pageSize: 1 }),
    billing.getEffectivePlan(active.id),
    isAdmin
      ? createInviteService({
          repo: createSupabaseInviteRepository(client),
          rateLimiter: createMemoryRateLimiter({ limit: 1000, windowMs: 60_000 }),
        }).listPending(active.id)
      : Promise.resolve([]),
  ]);

  const roleLabel = { owner: "Owner", admin: "Admin", member: "Member" }[active.role];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{active.name}</h2>
        <p className="text-sm text-muted-foreground">Visão geral da sua empresa</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Users} label="Membros ativos" value={members.total} />
        {isAdmin ? (
          <MetricCard icon={Mail} label="Convites pendentes" value={pendingInvites.length} />
        ) : null}
        <MetricCard
          icon={CreditCard}
          label="Plano atual"
          value={plan?.name ?? "—"}
          hint={plan ? `até ${String(plan.features.max_members ?? "?")} membros` : undefined}
        />
        <MetricCard icon={ShieldCheck} label="Seu papel" value={roleLabel} />
      </div>

      {/* ------------------------------------------------------------------
          EXEMPLOS DE GRÁFICOS DO TEMPLATE — dados fake.
          Os 3 tipos mais usados (linha, barras, donut) já estilizados pelos
          tokens do tema (--chart-1..5, validados p/ dark/light e daltonismo).
          Ao criar seu produto: troque os dados fake pelas métricas do seu
          domínio ou remova esta seção. Componentes: src/components/charts.
         ------------------------------------------------------------------ */}
      <section className="flex flex-col gap-4">
        <div>
          <h3 className="font-medium">Exemplos de gráficos do template</h3>
          <p className="text-sm text-muted-foreground">
            Dados fake — troque pelas métricas do seu produto (componentes em{" "}
            <code className="rounded bg-muted px-1 py-0.5">src/components/charts</code>).
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <LineChartCard
            title="Linha: receita mensal"
            description="Evolução no tempo, 2 séries"
            data={[
              { mes: "Jan", assinaturas: 1200, seats: 300 },
              { mes: "Fev", assinaturas: 1900, seats: 420 },
              { mes: "Mar", assinaturas: 1700, seats: 380 },
              { mes: "Abr", assinaturas: 2600, seats: 540 },
              { mes: "Mai", assinaturas: 3100, seats: 720 },
              { mes: "Jun", assinaturas: 2900, seats: 680 },
              { mes: "Jul", assinaturas: 3800, seats: 890 },
            ]}
            xKey="mes"
            series={[
              { key: "assinaturas", label: "Assinaturas" },
              { key: "seats", label: "Seats extras" },
            ]}
            valueFormat={{ style: "currency", currency: "BRL", maximumFractionDigits: 0 }}
          />
          <BarChartCard
            title="Barras: novos cadastros por semana"
            description="Magnitude por categoria, 1 série"
            data={[
              { semana: "S1", cadastros: 32 },
              { semana: "S2", cadastros: 41 },
              { semana: "S3", cadastros: 28 },
              { semana: "S4", cadastros: 56 },
              { semana: "S5", cadastros: 49 },
              { semana: "S6", cadastros: 63 },
            ]}
            xKey="semana"
            yKey="cadastros"
          />
          <DonutChartCard
            title="Donut: distribuição por plano"
            description="Composição do todo (máx. 5 fatias; excedente vira 'Outros')"
            data={[
              { label: "Free", value: 210 },
              { label: "Pro", value: 96 },
              { label: "Enterprise", value: 14 },
            ]}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Primeiros passos com o template</CardTitle>
          <CardDescription>
            Este dashboard é o ponto de partida do seu SaaS — troque estas etapas pelas métricas
            do seu domínio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <Link href="/dashboard/members" className="text-foreground underline underline-offset-4">
                Convide sua equipe
              </Link>{" "}
              — convites expiram em 7 dias e podem ser revogados.
            </li>
            <li>
              <Link href="/dashboard/billing" className="text-foreground underline underline-offset-4">
                Explore o billing
              </Link>{" "}
              — o gateway fake simula o ciclo completo de assinatura em dev.
            </li>
            <li>
              Edite <code className="rounded bg-muted px-1 py-0.5">src/config/brand.ts</code> e os
              tokens em <code className="rounded bg-muted px-1 py-0.5">globals.css</code> para dar a
              identidade do seu produto.
            </li>
            <li>
              Crie seu domínio em{" "}
              <code className="rounded bg-muted px-1 py-0.5">src/features/</code> seguindo o fluxo
              componentes → hooks → services → repositories.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
