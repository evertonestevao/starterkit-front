"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  HandCoins,
  MoreHorizontal,
  Plus,
  Search,
  Tag,
  Users,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const entries = [
  { person: "Mariana Oliveira", origin: "Campanha: novo espaço", category: "Campanhas", method: "Pix", date: "Hoje, 10:24", value: 350, status: "Confirmada", initials: "MO", tone: "green" },
  { person: "João e família", origin: "Dízimo", category: "Dízimos", method: "Pix", date: "Hoje, 09:12", value: 780, status: "Confirmada", initials: "JF", tone: "gold" },
  { person: "Anônimo", origin: "Oferta", category: "Ofertas", method: "Cartão", date: "Ontem, 19:45", value: 120, status: "Confirmada", initials: "AN", tone: "blue" },
  { person: "Carlos Henrique", origin: "Encontro de casais", category: "Eventos", method: "Pix", date: "Ontem, 16:08", value: 70, status: "Em análise", initials: "CH", tone: "rose" },
];

const filters = ["Todos", "Campanhas", "Dízimos", "Ofertas", "Eventos"] as const;
type FinanceFilter = (typeof filters)[number];

const categoryConfig = {
  Campanhas: { key: "campanhas", label: "Campanhas" },
  Dízimos: { key: "dizimos", label: "Dízimos" },
  Ofertas: { key: "ofertas", label: "Ofertas" },
  Eventos: { key: "eventos", label: "Eventos" },
} as const;

const monthlyByCategory = [
  { mes: "Mar", campanhas: 1800, dizimos: 4200, ofertas: 1100, eventos: 700 },
  { mes: "Abr", campanhas: 2400, dizimos: 5100, ofertas: 1300, eventos: 900 },
  { mes: "Mai", campanhas: 2100, dizimos: 4700, ofertas: 1500, eventos: 1400 },
  { mes: "Jun", campanhas: 3600, dizimos: 5800, ofertas: 1700, eventos: 1500 },
  { mes: "Jul", campanhas: 4200, dizimos: 6400, ofertas: 1900, eventos: 1800 },
  { mes: "Ago", campanhas: 5100, dizimos: 7200, ofertas: 2100, eventos: 1400 },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value);
}

export default function FinancePage() {
  const [selectedFilters, setSelectedFilters] = useState<FinanceFilter[]>([
    "Campanhas",
    "Dízimos",
    "Ofertas",
    "Eventos",
  ]);
  const allCategoriesSelected = selectedFilters.length === filters.length - 1;
  const filteredEntries = entries.filter((entry) => selectedFilters.includes(entry.category as FinanceFilter));
  const confirmed = filteredEntries.filter((entry) => entry.status === "Confirmada");
  const total = confirmed.reduce((sum, entry) => sum + entry.value, 0);
  const selectedSeries = selectedFilters.filter((filter): filter is Exclude<FinanceFilter, "Todos"> => filter !== "Todos").map((filter) => ({ key: categoryConfig[filter].key, label: categoryConfig[filter].label }));
  const toggleFilter = (filter: FinanceFilter) => {
    if (filter === "Todos") {
      setSelectedFilters(allCategoriesSelected ? [] : [...filters.slice(1)]);
      return;
    }
    setSelectedFilters((current) => current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary"><HandCoins className="size-4" /> Organização financeira da igreja</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Entradas financeiras</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Acompanhe dízimos, ofertas, campanhas e inscrições em um só lugar, com clareza para a liderança.</p>
        </div>
        <Button className="h-10 gap-2 rounded-xl"><Plus className="size-4" /> Registrar entrada</Button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[#e5d7a9] bg-[#fbf6e6] px-4 py-3 text-xs text-[#79632c] dark:border-border dark:bg-muted dark:text-muted-foreground"><CircleDollarSign className="size-4 shrink-0" /><span>Dados demonstrativos para visualizar o módulo. As entradas serão conectadas aos meios de pagamento na próxima etapa.</span></div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-semibold">Filtrar entradas</p><p className="text-xs text-muted-foreground">Selecione uma ou mais origens para atualizar os indicadores e o gráfico.</p></div>
          <div className="flex flex-wrap gap-2">{filters.map((filter) => { const active = filter === "Todos" ? allCategoriesSelected : selectedFilters.includes(filter); return <Button key={filter} variant={active ? "default" : "outline"} size="sm" aria-pressed={active} onClick={() => toggleFilter(filter)}>{filter}</Button>; })}</div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={CircleDollarSign} label="Entradas confirmadas" value={formatCurrency(total)} hint={allCategoriesSelected ? "todas as origens" : "origens selecionadas"} /><MetricCard icon={CheckCircle2} label="Lançamentos confirmados" value={confirmed.length} hint="prontos para conciliação" /><MetricCard icon={Clock3} label="Em análise" value={filteredEntries.filter((entry) => entry.status === "Em análise").length} hint="aguardando conferência" /><MetricCard icon={Users} label="Pessoas que contribuíram" value={allCategoriesSelected ? "38" : filteredEntries.length} hint="no mês demonstrativo" /></div>

      <BarChartCard
        title="Evolução das entradas"
        description="Total recebido por mês no período demonstrativo"
        data={monthlyByCategory}
        xKey="mes"
        series={selectedSeries}
        valueFormat={{ style: "currency", currency: "BRL", maximumFractionDigits: 0 }}
        height={250}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader className="gap-4 border-b"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><CardTitle>Registro de entradas</CardTitle><CardDescription className="mt-1">Dízimos, ofertas, campanhas e eventos da igreja.</CardDescription></div><Button variant="outline" size="sm" className="gap-2"><ChevronDown className="size-3.5" /> Período atual</Button></div><div className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground"><Search className="size-4" /><span>Buscar por pessoa ou origem</span></div></CardHeader>
          <CardContent className="grid gap-3 p-4">{filteredEntries.length > 0 ? filteredEntries.map((entry) => <EntryRow key={`${entry.person}-${entry.date}`} entry={entry} />) : <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma entrada encontrada para este filtro.</p>}</CardContent>
        </Card>

        <div className="flex flex-col gap-6"><Card><CardHeader><CardTitle>Por origem</CardTitle><CardDescription>Quanto cada frente gerou</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{([ ["Dízimos", HandCoins], ["Campanhas", Tag], ["Eventos", CalendarDays], ["Ofertas", ArrowDownToLine] ] as const).map(([name, Icon]) => { const sourceTotal = entries.filter((entry) => entry.category === name && entry.status === "Confirmada").reduce((sum, entry) => sum + entry.value, 0); const percent = total > 0 ? `${Math.round((sourceTotal / total) * 100)}%` : "0%"; return <OriginRow key={name} icon={Icon} name={name} value={formatCurrency(sourceTotal)} percent={percent} />; })}</CardContent></Card><Card className="border-primary/15 bg-primary text-primary-foreground"><CardHeader><CardTitle>Clareza para cuidar melhor</CardTitle><CardDescription className="text-primary-foreground/75">Um registro organizado ajuda a liderança a tomar decisões com responsabilidade.</CardDescription></CardHeader><CardContent><p className="text-sm leading-6 text-primary-foreground/90">Conecte cada entrada a uma origem e acompanhe o que sustenta os projetos da igreja.</p><Button variant="secondary" className="mt-5 gap-2 bg-[#f0d991] text-[#354b38] hover:bg-[#f7e6ae] dark:bg-[#241f15] dark:text-[#f0e9dc] dark:hover:bg-[#312a1c]">Ver relatórios <ArrowRight className="size-4" /></Button></CardContent></Card></div>
      </div>
    </div>
  );
}

function EntryRow({ entry }: { entry: (typeof entries)[number] }) {
  const toneClass = entry.tone === "green" ? "bg-[#e8f0e5] text-[#41694b]" : entry.tone === "gold" ? "bg-[#f3ebd5] text-[#a48432]" : entry.tone === "blue" ? "bg-[#e6eef0] text-[#4f727c]" : "bg-[#f6e7e3] text-[#a45e52]";
  return <div className="rounded-xl border p-4 transition-colors hover:border-primary/35 hover:bg-muted/15"><div className="flex items-start gap-3"><div className={`flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${toneClass}`}>{entry.initials}</div><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{entry.person}</h3><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{entry.origin}</span></div><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3.5" /> {entry.date} · {entry.method}</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${entry.status === "Confirmada" ? "bg-secondary text-primary" : "bg-[#fbf6e6] text-[#79632c]"}`}>{entry.status}</span><Button variant="ghost" size="icon-sm" aria-label={`Mais opções para ${entry.person}`}><MoreHorizontal className="size-4" /></Button></div></div><div className="mt-3 border-t pt-3 text-right text-sm font-semibold text-primary">{formatCurrency(entry.value)}</div></div></div></div>;
}

function OriginRow({ icon: Icon, name, value, percent }: { icon: typeof HandCoins; name: string; value: string; percent: string }) {
  return <div className="flex items-center gap-3 rounded-lg border p-3"><div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><Icon className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-xs"><span className="font-medium">{name}</span><span className="text-muted-foreground">{percent}</span></div><p className="mt-1 text-xs text-muted-foreground">{value}</p></div></div>;
}
