import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  HeartHandshake,
  MessageCircleHeart,
  MoreHorizontal,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Relacionamentos" };

const people = [
  { name: "Mariana Oliveira", initials: "MO", origin: "Visitou a página", journey: "Primeiro contato", lastContact: "há 18 min", nextStep: "Enviar boas-vindas", tone: "green" },
  { name: "Carlos Henrique", initials: "CH", origin: "Inscrição em evento", journey: "Se aproximando", lastContact: "ontem", nextStep: "Confirmar presença", tone: "gold" },
  { name: "Fernanda Alves", initials: "FA", origin: "Pedido de oração", journey: "Em acompanhamento", lastContact: "há 2 dias", nextStep: "Fazer retorno", tone: "rose" },
  { name: "Paulo e família", initials: "PF", origin: "Indicação da comunidade", journey: "Frequente", lastContact: "há 5 dias", nextStep: "Convidar para membresia", tone: "blue" },
  { name: "Juliana Martins", initials: "JM", origin: "Campanha da igreja", journey: "Se aproximando", lastContact: "há 1 semana", nextStep: "Agradecer participação", tone: "violet" },
];

const journey = [
  ["Primeiro contato", "Pessoas que acabaram de chegar", "42", "bg-[#e6eef0] text-[#4f727c]"],
  ["Se aproximando", "Já interagiram com a igreja", "68", "bg-[#f3ebd5] text-[#a48432]"],
  ["Em acompanhamento", "Precisam de um próximo cuidado", "24", "bg-[#f6e7e3] text-[#a45e52]"],
  ["Frequentes", "Relacionamentos já estabelecidos", "116", "bg-[#e8f0e5] text-[#41694b]"],
];

export default function RelationshipsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary"><HeartHandshake className="size-4" /> Cuidado contínuo</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Relacionamentos</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Entenda como as pessoas estão se aproximando da igreja e cuide de cada contato com intenção.</p>
        </div>
        <Button className="h-10 gap-2 rounded-xl"><UserPlus className="size-4" /> Adicionar pessoa</Button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[#d8e1d3] bg-[#edf3e9] px-4 py-3 text-xs text-[#41694b] dark:border-border dark:bg-muted dark:text-muted-foreground"><HeartHandshake className="size-4 shrink-0" /><span>Dados demonstrativos para visualizar o módulo. A jornada das pessoas será conectada aos canais da igreja na próxima etapa.</span></div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={Users} label="Pessoas acompanhadas" value="250" hint="na jornada da igreja" /><MetricCard icon={UserPlus} label="Novos contatos" value="42" hint="nos últimos 30 dias" /><MetricCard icon={Clock3} label="Próximos cuidados" value="24" hint="pedem atenção da equipe" /><MetricCard icon={CheckCircle2} label="Acompanhamentos feitos" value="86%" hint="neste mês" /></div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader className="gap-4 border-b"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><CardTitle>Pessoas recentes</CardTitle><CardDescription className="mt-1">Veja quem chegou e qual pode ser o próximo cuidado.</CardDescription></div><Button variant="outline" size="sm" className="gap-2"><ChevronDown className="size-3.5" /> Todos os contatos</Button></div><div className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground"><Search className="size-4" /><span>Buscar por nome ou origem</span></div></CardHeader>
          <CardContent className="grid gap-3 p-4">{people.map((person) => <PersonRow key={person.name} person={person} />)}</CardContent>
        </Card>

        <Card><CardHeader><CardTitle>Jornada da comunidade</CardTitle><CardDescription>Como as pessoas estão caminhando com a igreja.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{journey.map(([title, description, count, tone]) => <div key={title} className="flex items-center gap-3 rounded-xl border p-3"><span className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${tone}`}>{count}</span><div className="min-w-0"><p className="text-sm font-semibold">{title}</p><p className="truncate text-xs text-muted-foreground">{description}</p></div></div>)}<Button variant="ghost" size="sm" className="mt-2 justify-start gap-2 px-0 text-primary">Ver visão completa <ArrowRight className="size-3.5" /></Button></CardContent></Card>
      </div>

      <Card className="border-primary/15 bg-primary text-primary-foreground"><CardContent className="flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center"><div className="max-w-2xl"><p className="text-xs font-semibold tracking-[0.16em] text-[#d9c17b] uppercase dark:text-primary-foreground/70">Pessoas antes de números</p><h3 className="mt-2 text-xl font-semibold">Cada contato merece um próximo passo.</h3><p className="mt-2 text-sm leading-6 text-primary-foreground/75">Reúna os sinais da jornada em um só lugar para que sua equipe saiba quando acolher, acompanhar e celebrar cada história.</p></div><Button variant="secondary" className="shrink-0 gap-2 bg-[#f0d991] text-[#354b38] hover:bg-[#f7e6ae] dark:bg-[#241f15] dark:text-[#f0e9dc] dark:hover:bg-[#312a1c]">Convidar equipe <ArrowRight className="size-4" /></Button></CardContent></Card>
    </div>
  );
}

function PersonRow({ person }: { person: (typeof people)[number] }) {
  const toneClass = person.tone === "green" ? "bg-[#e8f0e5] text-[#41694b]" : person.tone === "gold" ? "bg-[#f3ebd5] text-[#a48432]" : person.tone === "rose" ? "bg-[#f6e7e3] text-[#a45e52]" : person.tone === "blue" ? "bg-[#e6eef0] text-[#4f727c]" : "bg-[#eee8f3] text-[#76548a]";
  return <div className="rounded-xl border p-4 transition-colors hover:border-primary/35 hover:bg-muted/15"><div className="flex items-start gap-3"><div className={`flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${toneClass}`}>{person.initials}</div><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{person.name}</h3><span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary">{person.journey}</span></div><p className="mt-1 text-xs text-muted-foreground">{person.origin} · {person.lastContact}</p></div><Button variant="ghost" size="icon-sm" aria-label={`Mais opções para ${person.name}`}><MoreHorizontal className="size-4" /></Button></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><MessageCircleHeart className="size-3.5 text-primary" /> Próximo passo: <span className="font-medium text-foreground">{person.nextStep}</span></div><Button variant="outline" size="sm" className="gap-1.5">Abrir perfil <ArrowRight className="size-3.5" /></Button></div></div></div></div>;
}
