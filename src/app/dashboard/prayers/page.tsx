import type { Metadata } from "next";
import Link from "next/link";
import { Check, Clock, HandHeart, MessageCircleHeart } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PaginationControls } from "@/components/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MarkPrayerRequestsSeen } from "@/features/church/components/mark-prayer-requests-seen";
import { MarcarTodosOrados, OracaoAcoes } from "@/features/community/components/oracao-acoes";
import { formatarData } from "@/lib/acompanhamento";
import { cn } from "@/lib/utils";
import { getCommunityService } from "@/server/community";
import { getActiveTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Pedidos de oração" };

/** "há 2 horas", "ontem", "12/09/2026" — sem biblioteca de datas. */
function whenLabel(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "agora há pouco";
  if (hours < 24) return `há ${hours} ${hours === 1 ? "hora" : "horas"}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Estado do pedido: aguardando oração → já oramos. */
const FILTROS = [
  { id: "pendentes", rotulo: "Aguardando oração" },
  { id: "orados", rotulo: "Já oramos" },
  { id: "todos", rotulo: "Todos" },
] as const;
type Filtro = (typeof FILTROS)[number]["id"];

export default async function PrayersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; situacao?: string }>;
}) {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou

  // Pedido de oração é dado sensível (LGPD): o texto é de quem lidera a
  // igreja. A RLS já não devolve nada para member; a tela explica o porquê em
  // vez de mostrar uma lista vazia sem motivo.
  if (active.role === "member") {
    return (
      <EmptyState
        icon={HandHeart}
        title="Os pedidos ficam com a liderança"
        description="Quem recebe pedido de oração conta coisa íntima. Por isso o texto é visível só para quem administra a igreja."
      />
    );
  }

  const { page, situacao: situacaoParam } = await searchParams;
  // Abre nos que aguardam oração: é o que pede ação.
  const situacao: Filtro = FILTROS.some((f) => f.id === situacaoParam) ? (situacaoParam as Filtro) : "pendentes";
  const community = await getCommunityService();
  // Pedido de oração é só da igreja que recebeu, mesmo para quem administra
  // uma igreja acima dela na rede: nem a contagem é mostrada fora daqui.
  const [requests, totais, seenAt] = await Promise.all([
    community.listPrayerRequests(active.id, { page: Number(page) || 1, situacao }),
    community.countOracoes(active.id),
    // Buscado ANTES de marcar como visto: o selo "Novo" usa o que já estava
    // gravado quando a página carregou, não o valor que está prestes a virar.
    community.getPrayerSeenAt(active.id).catch(() => null),
  ]);
  const now = new Date();
  const isNovo = (createdAt: string) => seenAt === null || createdAt > seenAt;
  // O mais recente desta página: em geral é a página 1, que traz os mais
  // novos primeiro — é o que vira o próximo "já vi até aqui".
  const seenUpTo = requests.items[0]?.created_at ?? null;
  const contagem: Record<Filtro, number> = {
    pendentes: totais.pendentes,
    orados: totais.orados,
    todos: totais.pendentes + totais.orados,
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Sem saída visual: só dispara a marca de "visto" no navegador,
          quando a tela é realmente aberta (ver o componente). */}
      <MarkPrayerRequestsSeen companyId={active.id} seenUpTo={seenUpTo} />
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <HandHeart className="size-4" /> Cuidado com quem pediu
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Pedidos de oração</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Chegam pela página pública da igreja. Trate cada um como o que é: alguém da comunidade
          confiando uma dor a vocês. Marque &ldquo;Já oramos&rdquo; para o pedido sair da fila.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard icon={Clock} label="Aguardando oração" value={totais.pendentes} hint="ainda não marcados" />
        <MetricCard icon={Check} label="Já oramos" value={totais.orados} hint="marcados pela liderança" />
        <MetricCard
          icon={MessageCircleHeart}
          label="Pedidos recebidos"
          value={totais.pendentes + totais.orados}
          hint="desde o início"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Filtrar pedidos">
          {FILTROS.map((f) => (
            <Link
              key={f.id}
              href={`/dashboard/prayers?situacao=${f.id}`}
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
        <MarcarTodosOrados pendentes={totais.pendentes} />
      </div>

      {requests.items.length === 0 ? (
        <EmptyState
          icon={MessageCircleHeart}
          title={
            situacao === "pendentes" && totais.orados > 0
              ? "Nenhum pedido aguardando oração"
              : situacao === "orados"
                ? "Nenhum pedido marcado como orado ainda"
                : "Nenhum pedido ainda"
          }
          description={
            situacao === "pendentes" && totais.orados > 0
              ? "Vocês já oraram por todos os pedidos recebidos. Os novos aparecem aqui."
              : "Assim que alguém enviar um pedido pela página da igreja, ele aparece aqui."
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {requests.items.map((request) => (
              <Card key={request.id} className={isNovo(request.created_at) ? "border-primary/40" : undefined}>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="flex items-center gap-2 font-medium">
                      {request.name?.trim() || "Pedido anônimo"}
                      {isNovo(request.created_at) ? <Badge>Novo</Badge> : null}
                      {request.orado_em ? (
                        <Badge className="bg-emerald-600 text-white">Já oramos</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                          Aguardando oração
                        </Badge>
                      )}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {whenLabel(request.created_at, now)}
                    </span>
                  </div>
                  {/* whitespace-pre-line: o texto vem de textarea e as quebras
                      de linha de quem escreveu fazem parte do pedido. */}
                  <p className="text-sm leading-6 whitespace-pre-line text-muted-foreground">
                    {request.message}
                  </p>
                  {request.orado_em ? (
                    <p className="text-xs text-muted-foreground">
                      Oramos em {formatarData(new Date(request.orado_em).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }))}
                    </p>
                  ) : null}
                  {request.anotacao ? (
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-line">
                      <span className="text-xs font-medium text-muted-foreground">Anotação da liderança: </span>
                      {request.anotacao}
                    </p>
                  ) : null}
                  <OracaoAcoes pedidoId={request.id} orado={request.orado_em !== null} anotacao={request.anotacao} />
                </CardContent>
              </Card>
            ))}
          </div>

          <PaginationControls
            page={requests.page}
            pageSize={requests.pageSize}
            total={requests.total}
            basePath="/dashboard/prayers"
            params={{ situacao }}
          />
        </>
      )}
    </div>
  );
}
