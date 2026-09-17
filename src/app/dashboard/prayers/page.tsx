import type { Metadata } from "next";
import {
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  HandHeart,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  UserRound,
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

export const metadata: Metadata = { title: "Pedidos de oração" };

const prayerRequests = [
  {
    name: "Ana Carolina",
    initials: "AC",
    title: "Saúde e recuperação",
    text: "Peço oração pela recuperação da minha mãe, que fará um novo tratamento nesta semana.",
    date: "Hoje, 09:42",
    status: "Novo",
    priority: "Atenção",
    tone: "rose",
  },
  {
    name: "Rafael Mendes",
    initials: "RM",
    title: "Direção profissional",
    text: "Preciso de sabedoria para tomar uma decisão importante sobre o trabalho.",
    date: "Hoje, 08:15",
    status: "Em oração",
    priority: "Normal",
    tone: "green",
  },
  {
    name: "Família Souza",
    initials: "FS",
    title: "Reconciliação na família",
    text: "Gostaria que a igreja orasse pela restauração do relacionamento entre nós.",
    date: "Ontem, 19:30",
    status: "Em oração",
    priority: "Normal",
    tone: "gold",
  },
  {
    name: "Beatriz Lima",
    initials: "BL",
    title: "Gratidão por uma resposta",
    text: "Quero compartilhar uma resposta de oração e agradecer a todos que caminharam comigo.",
    date: "Ontem, 15:10",
    status: "Respondido",
    priority: "Normal",
    tone: "blue",
  },
];

const recentActivity = [
  ["Pr. Lucas assumiu um pedido", "Saúde e recuperação", "há 12 min"],
  ["Camila marcou como respondido", "Gratidão por uma resposta", "há 2 h"],
  ["Novo pedido recebido", "Direção profissional", "hoje, 08:15"],
];

export default function PrayersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <HandHeart className="size-4" /> Cuidado pastoral
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Pedidos de oração
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Cuide de cada pedido com atenção, distribua responsabilidades e não
            deixe nenhuma pessoa sem retorno.
          </p>
        </div>
        <Button className="h-10 gap-2 rounded-xl">
          <Plus className="size-4" /> Registrar pedido
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[#d8e1d3] bg-[#edf3e9] px-4 py-3 text-xs text-[#41694b] dark:border-border dark:bg-muted dark:text-muted-foreground">
        <Heart className="size-4 shrink-0" />
        <span>
          Dados demonstrativos para visualizar o módulo. Os pedidos serão
          conectados ao fluxo público na próxima etapa.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={BellRing}
          label="Pedidos recebidos"
          value="24"
          hint="nos últimos 30 dias"
        />
        <MetricCard
          icon={Clock3}
          label="Aguardando cuidado"
          value="8"
          hint="pedem uma atenção hoje"
        />
        <MetricCard
          icon={HandHeart}
          label="Em oração"
          value="13"
          hint="acompanhados pela equipe"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Respondidos"
          value="31"
          hint="neste mês"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="gap-4 border-b">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <CardTitle>Caixa de oração</CardTitle>
                <CardDescription className="mt-1">
                  Acompanhe os pedidos e o cuidado dedicado a cada pessoa.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" className="gap-2 self-start">
                <ChevronDown className="size-3.5" /> Todos os pedidos
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground">
                <Search className="size-4" />
                <span>Buscar por nome ou pedido</span>
              </div>
              <Button variant="outline" size="sm" className="gap-2">
                <Users className="size-3.5" /> Minha equipe
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-4">
            {prayerRequests.map((request) => (
              <PrayerCard
                key={`${request.name}-${request.title}`}
                request={request}
              />
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Atividade recente</CardTitle>
              <CardDescription>O cuidado acontecendo agora</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {recentActivity.map(([title, request, time]) => (
                <div key={`${title}-${time}`} className="flex gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <MessageCircle className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-5">{title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {request}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {time}
                    </p>
                  </div>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="justify-start gap-2 px-0 text-primary"
              >
                Ver histórico completo <ArrowRight className="size-3.5" />
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/15 bg-primary text-primary-foreground">
            <CardHeader>
              <CardTitle>O cuidado continua</CardTitle>
              <CardDescription className="text-primary-foreground/75">
                Um pedido de oração pode ser o começo de uma relação mais
                próxima com a igreja.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-primary-foreground/90">
                Registre retornos, envolva a equipe certa e ajude cada pessoa a
                sentir que não está caminhando sozinha.
              </p>
              <Button
                variant="secondary"
                className="mt-5 gap-2 bg-[#f0d991] text-[#354b38] hover:bg-[#f7e6ae] dark:bg-[#241f15] dark:text-[#f0e9dc] dark:hover:bg-[#312a1c]"
              >
                Ver boas práticas <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PrayerCard({ request }: { request: (typeof prayerRequests)[number] }) {
  const toneClass =
    request.tone === "rose"
      ? "bg-[#f6e7e3] text-[#a45e52]"
      : request.tone === "green"
        ? "bg-[#e8f0e5] text-[#41694b]"
        : request.tone === "gold"
          ? "bg-[#f3ebd5] text-[#a48432]"
          : "bg-[#e6eef0] text-[#4f727c]";
  const statusClass =
    request.status === "Novo"
      ? "bg-[#f6e7e3] text-[#a45e52]"
      : request.status === "Respondido"
        ? "bg-muted text-muted-foreground"
        : "bg-secondary text-primary";
  return (
    <div className="rounded-xl border p-4 transition-colors hover:border-primary/35 hover:bg-muted/15">
      <div className="flex items-start gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${toneClass}`}
        >
          {request.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{request.title}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass}`}
                >
                  {request.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {request.name} · {request.date}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Mais opções para ${request.name}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {request.text}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserRound className="size-3.5" /> Responsável:{" "}
              <span className="font-medium text-foreground">
                {request.status === "Novo" ? "A definir" : "Equipe pastoral"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-1 text-[11px] ${request.priority === "Atenção" ? "bg-[#fbf6e6] text-[#79632c]" : "bg-muted text-muted-foreground"}`}
              >
                {request.priority}
              </span>
              <Button size="sm" variant="outline" className="gap-1.5">
                {request.status === "Respondido" ? (
                  <Check className="size-3.5" />
                ) : (
                  <HandHeart className="size-3.5" />
                )}
                {request.status === "Respondido"
                  ? "Ver retorno"
                  : "Assumir cuidado"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
