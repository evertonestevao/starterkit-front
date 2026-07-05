import Link from "next/link";
import {
  Building2,
  CreditCard,
  Flag,
  Layers,
  Mail,
  MonitorSmartphone,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brand } from "@/config/brand";

const features = [
  {
    icon: Building2,
    title: "Multi-tenant de verdade",
    description:
      "Usuário em N empresas, empresa ativa em contexto, papéis owner/admin/member e soft delete em toda tabela de negócio.",
  },
  {
    icon: ShieldCheck,
    title: "RLS testada, não só escrita",
    description:
      "Policies de Row Level Security em todas as tabelas, com testes SQL versionados que provam o isolamento entre empresas.",
  },
  {
    icon: CreditCard,
    title: "Billing atrás de interface",
    description:
      "PaymentGateway único (Stripe incluído via REST) com webhooks normalizados. Trocar de provedor não toca a lógica de negócio.",
  },
  {
    icon: Mail,
    title: "Convites e email transacional",
    description:
      "Convite por email com expiração e revogação, rate limit no envio e EmailProvider trocável (Resend incluído).",
  },
  {
    icon: ScrollText,
    title: "Auditoria pronta",
    description:
      "audit_logs por empresa, imutável para o client, com sanitização automática de dados sensíveis antes de gravar.",
  },
  {
    icon: Flag,
    title: "Feature flags por plano",
    description:
      "canAccessFeature como ponto único de checagem de limite, com overrides por empresa e por usuário via settings.",
  },
  {
    icon: MonitorSmartphone,
    title: "UI responsiva de verdade",
    description:
      "Sidebar única: rail colapsável no desktop, drawer no mobile. Tabelas viram cards em telas pequenas. Dark/light por tokens.",
  },
  {
    icon: Layers,
    title: "Arquitetura em camadas",
    description:
      "componentes → hooks → services → repositories/adapters. Nenhum componente fala com Supabase; backend é trocável.",
  },
];

const steps = [
  {
    title: "Clone e instale",
    code: "git clone <repo> && npm install",
    description: "Requisitos: Node 22+, Docker (para o Supabase local).",
  },
  {
    title: "Suba o banco local",
    code: "npx supabase start",
    description:
      "Migrations com RLS aplicam automaticamente. Copie as chaves geradas para .env.local.",
  },
  {
    title: "Rode o app",
    code: "npm run dev",
    description: "Crie sua conta, sua primeira empresa e explore o dashboard.",
  },
  {
    title: "Deixe com a sua cara",
    code: "src/config/brand.ts + globals.css",
    description:
      "Nome, tagline e cor primária em um lugar só. Depois crie seus módulos em src/features.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <span className="font-semibold tracking-tight">{brand.name}</span>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/login" />}>
              Entrar
            </Button>
            <Button size="sm" nativeButton={false} render={<Link href="/signup" />}>
              Criar conta
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center lg:py-28">
          <Badge variant="secondary">Starter kit SaaS multi-tenant</Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight lg:text-5xl">
            Lance seu próximo SaaS sem reescrever a fundação
          </h1>
          <p className="max-w-2xl text-balance text-muted-foreground lg:text-lg">
            {brand.name} é um template de produção com autenticação, multiempresa, RLS testada,
            billing desacoplado e UI responsiva. Troque nome, cores e entidades de domínio — o
            resto já está pronto.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
              Começar agora
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/login" />}>
              Ver o dashboard
            </Button>
          </div>
        </section>

        {/* Como usar */}
        <section className="border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Como usar o template</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Do clone ao seu produto em quatro passos.
            </p>
            <ol className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {steps.map((step, index) => (
                <li key={step.title}>
                  <Card className="h-full">
                    <CardHeader>
                      <CardDescription>Passo {index + 1}</CardDescription>
                      <CardTitle className="text-base">{step.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <code className="block overflow-x-auto rounded bg-muted px-2 py-1.5 text-xs">
                        {step.code}
                      </code>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">O que já vem pronto</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tudo que um SaaS precisa antes da primeira feature de domínio.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <feature.icon className="size-5 text-primary" aria-hidden />
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Arquitetura */}
        <section className="border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Fluxo único de dados</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Nenhum componente React chama o Supabase diretamente. A troca de backend (ou de
              gateway de pagamento) acontece nos adapters, sem reescrever telas.
            </p>
            <div className="mt-6 overflow-x-auto">
              <code className="block w-max rounded-lg border bg-background px-4 py-3 text-sm">
                componentes → hooks → services → repositories/adapters → Supabase | API | Gateway
              </code>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
          <span>
            {brand.name} — {brand.tagline}
          </span>
          <span>Feito com Next.js, Supabase e Tailwind</span>
        </div>
      </footer>
    </div>
  );
}
