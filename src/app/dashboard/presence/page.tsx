import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  HeartHandshake,
  Link2,
  MapPin,
  MonitorSmartphone,
  Pencil,
  QrCode,
  Share2,
  Sparkles,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Presença digital" };

const pageBlocks = [
  ["Apresentação", "Conte a história e a essência da sua igreja", true],
  ["Próximos eventos", "Mostre o que está acontecendo na comunidade", true],
  ["Pedidos de oração", "Abra um caminho de cuidado para quem chegar", true],
  ["Campanhas", "Convide pessoas a participar das causas da igreja", false],
];

export default function PresencePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary"><MonitorSmartphone className="size-4" /> Sua igreja na internet</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Presença digital</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Um espaço vivo para a comunidade encontrar sua igreja, escolher um próximo passo e continuar perto dela.</p>
        </div>
        <div className="flex gap-2"><Button variant="outline" className="gap-2"><Eye className="size-4" /> Ver página</Button><Button className="gap-2"><Pencil className="size-4" /> Editar página</Button></div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-[#c9ddc4] bg-[#edf3e9] px-4 py-3 text-sm text-[#41694b] dark:border-border dark:bg-muted dark:text-muted-foreground"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#5f9565]" /> Sua página está publicada e acessível.</div><Button variant="ghost" size="sm" className="gap-2 text-primary"><ExternalLink className="size-3.5" /> Abrir página</Button></div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={Eye} label="Visitas à página" value="1.284" hint="últimos 30 dias" /><MetricCard icon={HeartHandshake} label="Ações realizadas" value="346" hint="oração, eventos e visitas" /><MetricCard icon={QrCode} label="Acessos por QR Code" value="218" hint="neste mês" /><MetricCard icon={BarChart3} label="Página completa" value="82%" hint="falta pouco para publicar tudo" /></div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="flex flex-col gap-6">
          <Card><CardHeader className="flex-row items-center justify-between border-b"><div><CardTitle>O que aparece na sua página</CardTitle><CardDescription className="mt-1">Organize os caminhos que a comunidade pode encontrar.</CardDescription></div><Button variant="outline" size="sm" className="gap-2"><Pencil className="size-3.5" /> Personalizar</Button></CardHeader><CardContent className="grid gap-3 p-4">{pageBlocks.map(([title, description, active]) => <div key={title as string} className="flex items-center gap-3 rounded-xl border p-4"><div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-secondary text-primary" : "bg-muted text-muted-foreground"}`}>{active ? <Check className="size-4" /> : <Sparkles className="size-4" />}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title as string}</p><p className="mt-1 text-xs text-muted-foreground">{description as string}</p></div><span className={`text-xs font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>{active ? "Publicado" : "Preparar"}</span><ChevronRight className="size-4 text-muted-foreground" /></div>)}</CardContent></Card>

          <Card><CardHeader><CardTitle>Compartilhe sua presença</CardTitle><CardDescription>Use o canal que combina com cada momento da igreja.</CardDescription><Link href="/dashboard/settings/domain" className="mt-2 flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"><Globe className="size-3.5" /> Configurar domínio próprio</Link></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><AccessCard icon={Link2} title="Link público" value="conectaigreja.com/esperanca" action="Copiar link" /><AccessCard icon={QrCode} title="QR Code" value="Pronto para baixar" action="Baixar QR Code" /><AccessCard icon={Share2} title="Redes sociais" value="Conecte seus canais" action="Configurar" /></CardContent></Card>
        </div>

        <PublicPreview />
      </div>

      <Card className="border-primary/15 bg-primary text-primary-foreground"><CardContent className="flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center"><div className="max-w-2xl"><p className="text-xs font-semibold tracking-[0.16em] text-[#d9c17b] uppercase dark:text-primary-foreground/70">O primeiro encontro importa</p><h3 className="mt-2 text-xl font-semibold">Faça cada pessoa sentir que encontrou um lugar.</h3><p className="mt-2 text-sm leading-6 text-primary-foreground/75">Uma página clara ajuda visitantes, membros e apoiadores a encontrarem seu próximo passo sem precisar perguntar por onde começar.</p></div><Button variant="secondary" className="shrink-0 gap-2 bg-[#f0d991] text-[#354b38] hover:bg-[#f7e6ae] dark:bg-[#241f15] dark:text-[#f0e9dc] dark:hover:bg-[#312a1c]">Completar página <ArrowRight className="size-4" /></Button></CardContent></Card>
    </div>
  );
}

function AccessCard({ icon: Icon, title, value, action }: { icon: typeof Link2; title: string; value: string; action: string }) {
  return <div className="rounded-xl border bg-muted/15 p-4"><Icon className="size-5 text-primary" /><p className="mt-4 text-sm font-semibold">{title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{value}</p><Button variant="ghost" size="sm" className="mt-3 gap-1.5 px-0 text-primary">{action} {action === "Copiar link" ? <Copy className="size-3.5" /> : <ArrowRight className="size-3.5" />}</Button></div>;
}

function PublicPreview() {
  return <Card className="overflow-hidden border-primary/15"><CardHeader className="border-b bg-muted/25"><div className="flex items-center justify-between"><div><CardTitle>Prévia pública</CardTitle><CardDescription className="mt-1">Como a comunidade vê sua igreja.</CardDescription></div><span className="flex items-center gap-1.5 text-xs font-medium text-primary"><span className="size-1.5 rounded-full bg-[#5f9565]" /> Publicada</span></div></CardHeader><CardContent className="p-4"><div className="overflow-hidden rounded-2xl border bg-[#fbfcf9] shadow-sm"><div className="bg-[#41694b] px-5 pb-7 pt-6 text-white"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-full bg-[#f0d991] text-[#41694b]"><Sparkles className="size-5" /></div><div><p className="text-[10px] tracking-[0.16em] text-[#dce7d8] uppercase">Comunidade</p><p className="mt-1 font-semibold">Igreja Esperança</p></div></div><p className="mt-6 text-sm leading-5 text-[#e5eee1]">Um lugar para caminhar junto, cuidar de pessoas e viver a fé em comunidade.</p></div><div className="-mt-3 rounded-t-2xl bg-[#fbfcf9] p-4"><div className="grid grid-cols-2 gap-2"><div className="rounded-lg border bg-white p-3"><HeartHandshake className="size-4 text-[#41694b]" /><p className="mt-2 text-[11px] font-semibold">Pedir oração</p></div><div className="rounded-lg border bg-white p-3"><CalendarDaysIcon /><p className="mt-2 text-[11px] font-semibold">Ver eventos</p></div></div><div className="mt-3 flex items-center gap-2 rounded-lg bg-[#f3ebd5] p-3 text-[11px] text-[#79632c]"><MapPin className="size-3.5" /> Rua da Comunidade, 84</div></div></div><Button variant="outline" className="mt-4 w-full gap-2"><ExternalLink className="size-4" /> Abrir página pública</Button></CardContent></Card>;
}

function CalendarDaysIcon() {
  return <span className="flex size-4 items-center justify-center rounded border border-[#41694b] text-[8px] font-bold text-[#41694b]">23</span>;
}
