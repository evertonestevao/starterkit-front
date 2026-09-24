import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesCombined,
  HeartHandshake,
  Landmark,
  Megaphone,
  MessageCircleHeart,
  QrCode,
  Users,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChurchLinkNotices } from "@/features/church/components/church-link-notices";
import { createSupabaseInviteRepository } from "@/repositories/supabase/inviteRepository";
import { getChurchLinkService } from "@/server/churchLinks";
import { createMemoryRateLimiter } from "@/server/rateLimit";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant, getTenantService } from "@/server/tenant";
import { createInviteService } from "@/services/inviteService";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou

  const client = await getSupabaseServerClient();
  const tenant = await getTenantService();
  const isAdmin = permissionService.canManageMembers(active.role);

  const { data: auth } = await client.auth.getUser();
  const [members, pendingInvites, linkNotices] = await Promise.all([
    // pageSize mínimo: aqui só o total interessa (métrica), não as linhas.
    tenant.listMembers(active.id, { page: 1, pageSize: 1 }),
    isAdmin
      ? createInviteService({
          repo: createSupabaseInviteRepository(client),
          rateLimiter: createMemoryRateLimiter({
            limit: 1000,
            windowMs: 60_000,
          }),
        }).listPending(active.id)
      : Promise.resolve([]),
    // Respostas a convites de vínculo entre igrejas; falhar aqui não derruba o painel.
    auth.user
      ? getChurchLinkService()
          .then((service) => service.listNotices({ companyId: active.id, role: active.role, userId: auth.user.id }))
          .catch((err: unknown) => {
            console.error("[dashboard] falha ao carregar avisos de vínculo", err);
            return [];
          })
      : Promise.resolve([]),
  ]);

  const roleLabel = { owner: "Owner", admin: "Admin", member: "Member" }[
    active.role
  ];

  return (
    <div className="flex flex-col gap-6">
      <ChurchLinkNotices notices={linkNotices} />
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Bom ter você aqui</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            {active.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe os relacionamentos e os próximos passos da sua igreja.
          </p>
        </div>
        <Link
          href="#acoes"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          Ver ações importantes <ArrowRight className="size-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Membros da igreja"
          value={members.total}
          hint="cadastros ativos"
        />
        {isAdmin ? (
          <MetricCard
            icon={MessageCircleHeart}
            label="Convites pendentes"
            value={pendingInvites.length}
            hint="aguardando resposta"
          />
        ) : null}
        <MetricCard
          icon={Megaphone}
          label="Campanhas"
          value="Em breve"
          hint="crie e acompanhe metas"
        />
        <MetricCard
          icon={ChartNoAxesCombined}
          label="Seu papel"
          value={roleLabel}
          hint="permissão no espaço"
        />
      </div>

      <section id="acoes" className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/35">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>O que está acontecendo na sua igreja</CardTitle>
                <CardDescription className="mt-1">
                  Os principais espaços para cuidar da comunidade.
                </CardDescription>
              </div>
              <HeartHandshake className="size-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <DashboardAction
              icon={HeartHandshake}
              title="Pedidos de oração"
              description="Acompanhe quem pediu cuidado e retorno da equipe."
            />
            <DashboardAction
              icon={CalendarDays}
              title="Eventos e inscrições"
              description="Organize encontros e veja quem confirmou presença."
            />
            <DashboardAction
              icon={Users}
              title="Visitantes e membresia"
              description="Transforme o primeiro contato em relacionamento."
            />
            <DashboardAction
              icon={Megaphone}
              title="Campanhas"
              description="Crie metas para obras, missões e ações sociais."
            />
          </CardContent>
        </Card>

        <Card className="border-primary/15 bg-primary text-primary-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="size-5" /> Sua presença está pronta
            </CardTitle>
            <CardDescription className="text-primary-foreground/75">
              Compartilhe um único espaço para a comunidade encontrar a igreja.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl bg-white/10 p-4 text-sm leading-6 text-primary-foreground/90">
              Link público, QR Code ou NFC: cada pessoa escolhe como se
              aproximar.
            </div>
            <Link
              href="/dashboard/settings"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold hover:underline"
            >
              Configurar presença <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard
          icon={Landmark}
          title="Patrocinadores locais"
          description="Conecte negócios que acreditam na comunidade e ajudam a sustentar a plataforma."
        />
        <InfoCard
          icon={ChartNoAxesCombined}
          title="Visão para a liderança"
          description="Em breve, acompanhe os relacionamentos e o impacto das ações em um só painel."
        />
        <InfoCard
          icon={CalendarDays}
          title="Próximo passo"
          description="Complete as informações públicas da igreja para começar a receber visitas."
          href="/dashboard/settings"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Comece a cuidar da sua presença</CardTitle>
          <CardDescription>
            Uma base organizada para a equipe construir relacionamentos
            duradouros.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Convide a equipe que ajuda a cuidar dos relacionamentos da igreja.
            </span>
            <Link
              href="/dashboard/members"
              className="inline-flex items-center gap-2 font-medium text-foreground hover:underline"
            >
              Gerenciar equipe <ArrowRight className="size-4" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardAction({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof HeartHandshake;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border bg-background p-4 transition-colors hover:border-primary/35 hover:bg-muted/30">
      <Icon className="size-5 text-primary" />
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: typeof HeartHandshake;
  title: string;
  description: string;
  href?: string;
}) {
  const content = (
    <CardContent className="flex gap-3 p-5">
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </CardContent>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-xl transition-transform hover:-translate-y-0.5"
    >
      <Card>{content}</Card>
    </Link>
  ) : (
    <Card>{content}</Card>
  );
}
