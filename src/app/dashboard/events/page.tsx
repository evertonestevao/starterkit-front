import type { Metadata } from "next";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  MapPin,
  MoreHorizontal,
  Plus,
  Ticket,
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

export const metadata: Metadata = { title: "Eventos" };

const events = [
  {
    title: "Culto de celebração",
    type: "Culto",
    date: "Dom, 23 ago",
    time: "19:00",
    location: "Templo principal",
    registrations: 184,
    capacity: 250,
    access: "Gratuito",
    price: 0,
    status: "Publicado",
    tone: "green",
  },
  {
    title: "Encontro de casais",
    type: "Comunhão",
    date: "Sex, 28 ago",
    time: "20:00",
    location: "Salão da igreja",
    registrations: 38,
    capacity: 50,
    access: "Pago",
    price: 35,
    status: "Publicado",
    tone: "gold",
  },
  {
    title: "Manhã de ação social",
    type: "Ação social",
    date: "Sáb, 29 ago",
    time: "09:00",
    location: "Espaço comunidade",
    registrations: 62,
    capacity: 80,
    access: "Gratuito",
    price: 0,
    status: "Publicado",
    tone: "blue",
  },
  {
    title: "Curso de novos membros",
    type: "Formação",
    date: "Dom, 06 set",
    time: "10:30",
    location: "Sala 03",
    registrations: 0,
    capacity: 30,
    access: "Pago",
    price: 20,
    status: "Rascunho",
    tone: "rose",
  },
];

const activity = [
  ["3 novas inscrições", "Culto de celebração", "há 14 min"],
  ["Ana publicou o evento", "Manhã de ação social", "há 2 h"],
  ["Lista atualizada", "Encontro de casais", "ontem"],
];

export default function EventsPage() {
  const publishedEvents = events.filter(
    (event) => event.status === "Publicado",
  ).length;
  const registrations = events.reduce(
    (total, event) => total + event.registrations,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <CalendarDays className="size-4" /> Agenda da comunidade
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Eventos e inscrições
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Organize os encontros da igreja, divulgue cada oportunidade e
            acompanhe quem está se preparando para participar.
          </p>
        </div>
        <Button className="h-10 gap-2 rounded-xl">
          <Plus className="size-4" /> Novo evento
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[#d8e1d3] bg-[#edf3e9] px-4 py-3 text-xs text-[#41694b] dark:border-border dark:bg-muted dark:text-muted-foreground">
        <CalendarDays className="size-4 shrink-0" />
        <span>
          Dados demonstrativos para visualizar o módulo. As inscrições serão
          conectadas na próxima etapa.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CalendarDays}
          label="Eventos publicados"
          value={publishedEvents}
          hint="na agenda da igreja"
        />
        <MetricCard
          icon={Ticket}
          label="Inscrições"
          value={registrations}
          hint="nos eventos demonstrativos"
        />
        <MetricCard
          icon={Users}
          label="Próximo encontro"
          value="184"
          hint="pessoas confirmadas"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Taxa de presença"
          value="82%"
          hint="média dos últimos eventos"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between border-b">
            <div>
              <CardTitle>Próximos eventos</CardTitle>
              <CardDescription className="mt-1">
                Veja o que está chegando e como está a participação.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="hidden gap-2 sm:flex"
            >
              Todos <ChevronRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 p-4">
            {events.map((event) => (
              <EventRow key={event.title} event={event} />
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <MiniCalendar />
          <Card>
            <CardHeader>
              <CardTitle>Atividade recente</CardTitle>
              <CardDescription>Movimentos na agenda</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {activity.map(([title, event, time]) => (
                <div key={`${title}-${time}`} className="flex gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <CalendarDays className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-5">{title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {event}
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
                Ver histórico <ArrowRight className="size-3.5" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-primary/15 bg-primary text-primary-foreground">
        <CardContent className="flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-[#d9c17b] uppercase dark:text-primary-foreground/70">
              Um convite para pertencer
            </p>
            <h3 className="mt-2 text-xl font-semibold">
              Cada evento pode ser o começo de uma nova história.
            </h3>
            <p className="mt-2 text-sm leading-6 text-primary-foreground/75">
              Publique encontros com clareza, facilite a inscrição e esteja
              preparado para acolher quem está chegando.
            </p>
          </div>
          <Button
            variant="secondary"
            className="shrink-0 gap-2 bg-[#f0d991] text-[#354b38] hover:bg-[#f7e6ae] dark:bg-[#241f15] dark:text-[#f0e9dc] dark:hover:bg-[#312a1c]"
          >
            Ver página pública <Eye className="size-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function EventRow({ event }: { event: (typeof events)[number] }) {
  const progress = event.capacity
    ? Math.round((event.registrations / event.capacity) * 100)
    : 0;
  const toneClass =
    event.tone === "green"
      ? "bg-[#e8f0e5] text-[#41694b]"
      : event.tone === "gold"
        ? "bg-[#f3ebd5] text-[#a48432]"
        : event.tone === "blue"
          ? "bg-[#e6eef0] text-[#4f727c]"
          : "bg-[#f6e7e3] text-[#a45e52]";
  return (
    <div className="rounded-xl border p-4 transition-colors hover:border-primary/35 hover:bg-muted/15">
      <div className="flex items-start gap-3">
        <div
          className={`flex size-11 shrink-0 flex-col items-center justify-center rounded-xl ${toneClass}`}
        >
          <span className="text-[10px] font-semibold uppercase">
            {event.date.split(",")[0]}
          </span>
          <span className="text-lg font-bold leading-5">
            {event.date.split(" ")[1]}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{event.title}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {event.type}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${event.access === "Gratuito" ? "bg-secondary text-primary" : "bg-[#f3ebd5] text-[#79632c]"}`}
                >
                  {event.access === "Gratuito"
                    ? "Gratuito"
                    : `R$ ${event.price.toFixed(2).replace(".", ",")}`}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock3 className="size-3.5" /> {event.time}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" /> {event.location}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 self-end sm:self-start">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${event.status === "Publicado" ? "bg-secondary text-primary" : "bg-muted text-muted-foreground"}`}
              >
                {event.status}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Mais opções para ${event.title}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${event.status === "Publicado" ? "bg-primary" : "bg-muted-foreground/30"}`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {event.registrations}/{event.capacity} inscritos
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniCalendar() {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Agosto 2026</CardTitle>
          <CardDescription>Próximos compromissos</CardDescription>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Mês anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Próximo mês">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
            <span key={`${day}-${index}`} className="py-1 font-medium">
              {day}
            </span>
          ))}
          {Array.from({ length: 31 }, (_, index) => {
            const day = index + 1;
            const marked = [23, 28, 29].includes(day);
            return (
              <span
                key={day}
                className={`flex aspect-square items-center justify-center rounded-md text-xs ${marked ? "bg-secondary font-semibold text-primary" : "text-foreground"}`}
              >
                {day}
              </span>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-primary" /> Dias com eventos
          publicados
        </div>
      </CardContent>
    </Card>
  );
}
