import type { Metadata } from "next";
import { Building2, CheckCircle2, Copy, Landmark, PauseCircle, QrCode, Users } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Patrocinadores" };

const sponsors = [
  { name: "Mercado Boa Praça", category: "Alimentação", status: "Ativo", initials: "MB", tone: "gold" },
  { name: "Clínica Vida Plena", category: "Saúde", status: "Ativo", initials: "CV", tone: "green" },
  { name: "Construtora Horizonte", category: "Construção", status: "Ativo", initials: "CH", tone: "blue" },
  { name: "Estúdio Aurora", category: "Serviços", status: "Inativo", initials: "EA", tone: "rose" },
  { name: "Padaria do Bairro", category: "Alimentação", status: "Inativo", initials: "PB", tone: "gray" },
];

export default function SponsorsPage() {
  const activeSponsors = sponsors.filter((sponsor) => sponsor.status === "Ativo");
  const inactiveSponsors = sponsors.filter((sponsor) => sponsor.status === "Inativo");
  const categories = new Set(sponsors.map((sponsor) => sponsor.category)).size;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-primary"><Landmark className="size-4" /> Sustentabilidade da comunidade</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Patrocinadores locais</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Conheça os negócios que caminham junto com a sua igreja e fortalecem sua presença na comunidade.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Building2} label="Patrocinadores ativos" value={activeSponsors.length} hint="parcerias vigentes" />
        <MetricCard icon={PauseCircle} label="Parceiros inativos" value={inactiveSponsors.length} hint="fora da rede ativa" />
        <MetricCard icon={Users} label="Alcance da parceria" value="2.840" hint="pessoas na comunidade" />
        <MetricCard icon={CheckCircle2} label="Categorias presentes" value={categories} hint="setores representados" />
      </div>

      <Card id="novo-patrocinador" className="border-primary/15 bg-primary text-primary-foreground">
        <CardContent className="flex flex-col justify-between gap-6 p-6 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-[#d9c17b] uppercase dark:text-primary-foreground/70"><QrCode className="size-4" /> Convite para patrocinador</div>
            <h3 className="mt-3 text-xl font-semibold">Convide um negócio local para caminhar com a igreja.</h3>
            <p className="mt-2 text-sm leading-6 text-primary-foreground/75">Compartilhe um link ou QR Code para o patrocinador conhecer a proposta e iniciar o contato com a plataforma.</p>
          </div>
          <div className="flex w-full max-w-md flex-col gap-3 rounded-xl bg-white/10 p-4 sm:flex-row sm:items-center">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-white text-[#41694b]"><QrCode className="size-14" /></div>
            <div className="min-w-0 flex-1"><p className="text-xs font-medium text-primary-foreground/70">Link de convite · exemplo</p><p className="mt-1 truncate text-sm font-semibold">conectaigreja.com/patrocinar/esperanca</p><Button variant="secondary" size="sm" className="mt-3 gap-2 bg-[#f0d991] text-[#354b38] hover:bg-[#f7e6ae] dark:bg-[#241f15] dark:text-[#f0e9dc] dark:hover:bg-[#312a1c]"><Copy className="size-3.5" /> Copiar link</Button></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rede de patrocinadores</CardTitle>
          <CardDescription>Uma visão simples de quem está presente e quem já fez parte da rede.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <SponsorGroup title="Parceiros ativos" description="Negócios que estão atualmente associados à comunidade." sponsors={activeSponsors} />
          <div className="border-t" />
          <SponsorGroup title="Parceiros inativos" description="Negócios que já apoiaram a igreja, mas não estão ativos no momento." sponsors={inactiveSponsors} muted />
        </CardContent>
      </Card>
    </div>
  );
}

function SponsorGroup({ title, description, sponsors: group, muted = false }: { title: string; description: string; sponsors: typeof sponsors; muted?: boolean }) {
  return (
    <section>
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{description}</p></div><span className="text-xs text-muted-foreground">{group.length} {group.length === 1 ? "parceiro" : "parceiros"}</span></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {group.map((sponsor) => <SponsorRow key={sponsor.name} sponsor={sponsor} muted={muted} />)}
      </div>
    </section>
  );
}

function SponsorRow({ sponsor, muted }: { sponsor: (typeof sponsors)[number]; muted: boolean }) {
  const toneClass = sponsor.tone === "gold" ? "bg-[#f3ebd5] text-[#a48432]" : sponsor.tone === "green" ? "bg-[#e8f0e5] text-[#41694b]" : sponsor.tone === "blue" ? "bg-[#e6eef0] text-[#4f727c]" : sponsor.tone === "rose" ? "bg-[#f6e7e3] text-[#a45e52]" : "bg-muted text-muted-foreground";
  return <div className={`flex items-center gap-3 rounded-xl border p-4 ${muted ? "opacity-75" : ""}`}><div className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${toneClass}`}>{sponsor.initials}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="truncate text-sm font-semibold">{sponsor.name}</h4><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{sponsor.category}</span></div><p className="mt-1 text-xs text-muted-foreground">{muted ? "Parceria encerrada" : "Visível na página pública"}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${muted ? "bg-muted text-muted-foreground" : "bg-secondary text-primary"}`}>{muted ? "Inativo" : "Ativo"}</span></div>;
}
