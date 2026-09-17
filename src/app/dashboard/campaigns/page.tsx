import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Eye,
  HeartHandshake,
  Megaphone,
  MoreHorizontal,
  Plus,
  Share2,
  Target,
  Users,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Campanhas" };

const campaigns = [
  {
    title: "Um novo espaço para as crianças",
    category: "Estrutura",
    raised: 34000,
    goal: 50000,
    supporters: 86,
    deadline: "31 de agosto de 2026",
    status: "Ativa",
    tone: "gold",
  },
  {
    title: "Missões que atravessam fronteiras",
    category: "Missões",
    raised: 12750,
    goal: 18000,
    supporters: 42,
    deadline: "15 de setembro de 2026",
    status: "Ativa",
    tone: "green",
  },
  {
    title: "Cestas para a comunidade",
    category: "Ação social",
    raised: 8400,
    goal: 10000,
    supporters: 31,
    deadline: "Encerrada em 20 de junho",
    status: "Concluída",
    tone: "blue",
  },
];

const activities = [
  ["Mariana Oliveira apoiou", "Um novo espaço para as crianças", "há 18 min"],
  [
    "João e família contribuíram",
    "Missões que atravessam fronteiras",
    "há 1 h",
  ],
  ["Você publicou uma atualização", "Um novo espaço para as crianças", "ontem"],
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CampaignsPage() {
  const totalRaised = campaigns.reduce(
    (total, campaign) => total + campaign.raised,
    0,
  );
  const activeCampaigns = campaigns.filter(
    (campaign) => campaign.status === "Ativa",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Megaphone className="size-4" /> Mobilização da comunidade
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Campanhas
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Transforme uma necessidade da igreja em uma causa clara, acompanhe o
            avanço e celebre cada pessoa que participa.
          </p>
        </div>
        <Button className="h-10 gap-2 rounded-xl">
          <Plus className="size-4" /> Nova campanha
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[#e5d7a9] bg-[#fbf6e6] px-4 py-3 text-xs text-[#79632c] dark:border-border dark:bg-muted dark:text-muted-foreground">
        <Target className="size-4 shrink-0" />
        <span>
          Dados demonstrativos para visualizar o módulo. As contribuições serão
          conectadas na próxima etapa.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CircleDollarSign}
          label="Arrecadado nas campanhas"
          value={formatCurrency(totalRaised)}
          hint="no período demonstrativo"
        />
        <MetricCard
          icon={Megaphone}
          label="Campanhas ativas"
          value={activeCampaigns}
          hint="mobilizando a comunidade"
        />
        <MetricCard
          icon={Users}
          label="Apoiadores"
          value="159"
          hint="pessoas envolvidas"
        />
        <MetricCard
          icon={ArrowDownRight}
          label="Evolução da arrecadação"
          value="+18,4%"
          hint="comparado ao mês anterior"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between border-b">
            <div>
              <CardTitle>Suas campanhas</CardTitle>
              <CardDescription className="mt-1">
                Acompanhe metas, prazos e participação.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="hidden gap-2 sm:flex"
            >
              Todas <ChevronDown className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 p-4">
            {campaigns.map((campaign) => {
              const progress = Math.round(
                (campaign.raised / campaign.goal) * 100,
              );
              return (
                <CampaignRow
                  key={campaign.title}
                  campaign={campaign}
                  progress={progress}
                />
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Atividade recente</CardTitle>
            <CardDescription>Movimentos da comunidade</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {activities.map(([title, campaign, time]) => (
              <div key={`${title}-${time}`} className="flex gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                  <HeartHandshake className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-5">{title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {campaign}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {time}
                  </p>
                </div>
              </div>
            ))}
            <Link
              href="#atividades"
              className="mt-1 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
            >
              Ver toda a atividade <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Próximas oportunidades</CardTitle>
            <CardDescription>
              Pequenos próximos passos para manter a campanha viva.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Opportunity
              icon={Share2}
              title="Compartilhe a campanha"
              description="Leve a causa para os canais onde a sua comunidade já conversa."
            />
            <Opportunity
              icon={CalendarDays}
              title="Publique uma atualização"
              description="Conte o que já aconteceu e mostre o próximo marco da meta."
            />
            <Opportunity
              icon={Eye}
              title="Veja a página pública"
              description="Confira como a campanha aparece para quem deseja apoiar."
            />
            <Opportunity
              icon={CheckCircle2}
              title="Agradeça os apoiadores"
              description="Reconheça quem participou e fortaleça o vínculo com a igreja."
            />
          </CardContent>
        </Card>
        <Card className="border-primary/15 bg-primary text-primary-foreground">
          <CardHeader>
            <CardTitle>Campanhas com propósito</CardTitle>
            <CardDescription className="text-primary-foreground/75">
              Uma boa campanha ajuda a igreja a contar sua história com clareza.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-primary-foreground/90">
              Apresente a necessidade, convide a comunidade a caminhar junto e
              mantenha todos perto do impacto gerado.
            </p>
            <Button
              variant="secondary"
              className="mt-6 gap-2 bg-[#f0d991] text-[#354b38] hover:bg-[#f7e6ae] dark:bg-[#241f15] dark:text-[#f0e9dc] dark:hover:bg-[#312a1c]"
            >
              Ver boas práticas <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CampaignRow({
  campaign,
  progress,
}: {
  campaign: (typeof campaigns)[number];
  progress: number;
}) {
  const toneClass =
    campaign.tone === "gold"
      ? "bg-[#f3ebd5] text-[#a48432]"
      : campaign.tone === "green"
        ? "bg-[#e8f0e5] text-[#41694b]"
        : "bg-[#e6eef0] text-[#4f727c]";
  return (
    <div className="rounded-xl border p-4 transition-colors hover:border-primary/35 hover:bg-muted/15">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}
          >
            <Megaphone className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{campaign.title}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {campaign.category}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock3 className="size-3.5" /> {campaign.deadline}
              </span>
              <span className="flex items-center gap-1">
                <Users className="size-3.5" /> {campaign.supporters} apoiadores
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 self-end sm:self-start">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${campaign.status === "Ativa" ? "bg-secondary text-primary" : "bg-muted text-muted-foreground"}`}
          >
            {campaign.status}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Mais opções para ${campaign.title}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-5 flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold">
              {formatCurrency(campaign.raised)}
            </span>
            <span className="text-muted-foreground">
              Meta {formatCurrency(campaign.goal)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${campaign.status === "Concluída" ? "bg-[#719371]" : "bg-primary"}`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
        <span className="text-sm font-semibold tabular-nums text-primary">
          {progress}%
        </span>
      </div>
    </div>
  );
}

function Opportunity({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Share2;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/15 p-4">
      <Icon className="size-5 text-primary" />
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
