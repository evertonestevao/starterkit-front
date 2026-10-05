import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CalendarClock, Clock, HeartHandshake, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PaginationControls } from "@/components/pagination-controls";
import { RankingBarras } from "@/components/ranking-barras";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VisitaAcoes } from "@/features/community/components/visita-acoes";
import { formatarData } from "@/lib/acompanhamento";
import { cn } from "@/lib/utils";
import { getCommunityService } from "@/server/community";
import { getActiveTenant } from "@/server/tenant";
import { normalizarPeriodo, situacaoDoPedido, type PessoaQueVisita } from "@/services/communityService";
import type { Visitor } from "@/types/database";

export const metadata: Metadata = { title: "Quem quer visita" };

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** As etapas de um pedido, na ordem em que acontecem. */
const FILTROS = [
  { id: "novos", rotulo: "Aguardando contato" },
  { id: "andamento", rotulo: "Contato feito" },
  { id: "feitas", rotulo: "Visitados" },
  { id: "todos", rotulo: "Todos" },
] as const;
type Filtro = (typeof FILTROS)[number]["id"];

export default async function QuemQuerVisitaPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; situacao?: string; de?: string; ate?: string }>;
}) {
  const { active } = await getActiveTenant();
  if (!active) return null;

  const { page, situacao: situacaoParam, de: deParam, ate: ateParam } = await searchParams;
  const { de, ate } = normalizarPeriodo(deParam, ateParam);
  const periodo = { de, ate };
  // Abre em "aguardando contato": é o que pede ação primeiro.
  const situacao: Filtro = FILTROS.some((f) => f.id === situacaoParam) ? (situacaoParam as Filtro) : "novos";
  const community = await getCommunityService();
  const [pedidos, totais, quemVisita, porPessoa] = await Promise.all([
    community.listVisitors(active.id, { page: Number(page) || 1, situacao, ...periodo }),
    community.countVisitas(active.id, periodo),
    // Complementos da tela: se falharem, a lista de pedidos continua.
    community.quemPodeVisitar(active.id).catch((err: unknown) => {
      console.error("[visitas] falha ao carregar quem pode visitar", err);
      return [] as PessoaQueVisita[];
    }),
    community.visitasPorPessoa(active.id, periodo).catch((err: unknown) => {
      console.error("[visitas] falha ao contar as visitas por pessoa", err);
      return [];
    }),
  ]);

  const textoPeriodo =
    de && ate
      ? `de ${formatarData(de)} a ${formatarData(ate)}`
      : de
        ? `desde ${formatarData(de)}`
        : ate
          ? `até ${formatarData(ate)}`
          : "desde o início";
  const href = (extra: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ situacao, de, ate, ...extra })) if (v) qs.set(k, v);
    return `/dashboard/relationships?${qs}`;
  };
  const contagem: Record<Filtro, number> = {
    novos: totais.novos,
    andamento: totais.andamento,
    feitas: totais.feitas,
    todos: totais.novos + totais.andamento + totais.feitas,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <HeartHandshake className="size-4" /> Pessoas antes de números
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Quem quer visita</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Pessoas que pediram, pela página da igreja, a visita do Pastor ou de alguém da igreja. Fale com a pessoa,
          marque &ldquo;Contato feito&rdquo; com o dia combinado e, depois, registre a visita e quem foi.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard icon={Clock} label="Aguardando contato" value={totais.novos} hint="ninguém falou ainda" />
        <MetricCard icon={CalendarClock} label="Contato feito" value={totais.andamento} hint="visita ainda por fazer" />
        <MetricCard icon={CalendarCheck} label="Visitados" value={totais.feitas} hint={textoPeriodo} />
      </div>

      <form
        method="get"
        action="/dashboard/relationships"
        className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="situacao" value={situacao} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="de">Pedidos de</Label>
          <Input id="de" name="de" type="date" defaultValue={de ?? ""} className="sm:w-44" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ate">até</Label>
          <Input id="ate" name="ate" type="date" defaultValue={ate ?? ""} className="sm:w-44" />
        </div>
        <div className="flex gap-2">
          <Button type="submit">Filtrar</Button>
          {de || ate ? (
            <Link href={href({ de: undefined, ate: undefined })} className={buttonVariants({ variant: "ghost" })}>
              Limpar período
            </Link>
          ) : null}
        </div>
      </form>

      <nav className="flex flex-wrap gap-2" aria-label="Filtrar pedidos">
        {FILTROS.map((f) => (
          <Link
            key={f.id}
            href={href({ situacao: f.id })}
            aria-current={situacao === f.id ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              situacao === f.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {f.rotulo} <span className="tabular-nums opacity-75">({contagem[f.id]})</span>
          </Link>
        ))}
      </nav>

      {pedidos.items.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={
            situacao === "novos"
              ? "Nenhum pedido aguardando contato"
              : situacao === "andamento"
                ? "Nenhuma visita combinada no momento"
                : "Nenhum pedido aqui"
          }
          description="Quando alguém pedir uma visita pela página da igreja, o pedido aparece aqui."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {pedidos.items.map((p) => (
              <li key={p.id}>
                <PedidoCard pedido={p} quemVisita={quemVisita} />
              </li>
            ))}
          </ul>

          <PaginationControls
            page={pedidos.page}
            pageSize={pedidos.pageSize}
            total={pedidos.total}
            basePath="/dashboard/relationships"
            params={{ situacao, de, ate }}
          />
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visitas por pessoa</CardTitle>
          <CardDescription>
            Quantas visitas cada membro fez, {textoPeriodo === "desde o início" ? textoPeriodo : `com pedidos ${textoPeriodo}`}.
            Conta quem foi marcado em &ldquo;Quem visitou&rdquo;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RankingBarras
            vazio="Nenhuma visita registrada com membros marcados ainda."
            itens={porPessoa.map((v) => ({
              key: v.membroId,
              nome: v.nome,
              valor: v.visitas,
              valorTexto: v.visitas === 1 ? "1 visita" : `${v.visitas} visitas`,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function PedidoCard({ pedido: p, quemVisita }: { pedido: Visitor; quemVisita: PessoaQueVisita[] }) {
  const etapa = situacaoDoPedido(p);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{p.name}</p>
            <p className="text-sm tabular-nums">{p.contact}</p>
            {p.endereco ? <p className="text-sm text-muted-foreground">{p.endereco}</p> : null}
          </div>
          <div className="flex flex-col items-end gap-1">
            {etapa === "feitas" ? (
              <Badge className="bg-emerald-600 text-white">Visitado</Badge>
            ) : etapa === "andamento" ? (
              <Badge variant="outline" className="border-sky-600 text-sky-700 dark:text-sky-400">
                Contato feito
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                Aguardando contato
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">pedido em {formatDateTime(p.created_at)}</span>
          </div>
        </div>

        {p.mensagem ? (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm leading-6 whitespace-pre-line">{p.mensagem}</p>
        ) : null}

        {p.contato_em && etapa !== "feitas" ? (
          <p className="text-sm">
            Contato feito em <strong>{formatarData(p.contato_em)}</strong>
            {p.agendada_para ? (
              <>
                {" "}
                · visita marcada para <strong>{formatarData(p.agendada_para)}</strong>
              </>
            ) : (
              " · visita ainda sem data"
            )}
            {p.contato_obs ? <span className="block text-muted-foreground">{p.contato_obs}</span> : null}
          </p>
        ) : null}

        {etapa === "feitas" ? (
          <p className="text-sm">
            Visitado em <strong>{formatarData(p.visitado_em)}</strong> por <strong>{p.visitado_por}</strong>
            {p.visita_obs ? <span className="block text-muted-foreground">{p.visita_obs}</span> : null}
          </p>
        ) : null}

        <VisitaAcoes
          visitorId={p.id}
          nome={p.name}
          telefone={p.contact}
          etapa={etapa}
          agendadaPara={p.agendada_para}
          contatoObs={p.contato_obs}
          quemVisita={quemVisita}
        />
      </CardContent>
    </Card>
  );
}
