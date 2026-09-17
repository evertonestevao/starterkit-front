import type { Metadata } from "next";
import { CalendarClock, HandHeart, Inbox, MessageCircleHeart } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent } from "@/components/ui/card";
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

export default async function PrayersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou

  const { page } = await searchParams;
  const community = await getCommunityService();
  const [requests, counts] = await Promise.all([
    community.listPrayerRequests(active.id, { page: Number(page) || 1 }),
    community.getCounts(active.id),
  ]);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <HandHeart className="size-4" /> Cuidado com quem pediu
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Pedidos de oração</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Chegam pela página pública da igreja. Trate cada um como o que é: alguém da comunidade
          confiando uma dor a vocês.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={MessageCircleHeart}
          label="Pedidos recebidos"
          value={counts.prayerRequests}
          hint="desde o início"
        />
        <MetricCard
          icon={CalendarClock}
          label="Nos últimos 7 dias"
          value={counts.lastWeek}
          hint="oração, eventos e visitas"
        />
        <MetricCard
          icon={Inbox}
          label="Nesta página"
          value={requests.items.length}
          hint={`de ${requests.total}`}
        />
      </div>

      {requests.items.length === 0 ? (
        <EmptyState
          icon={MessageCircleHeart}
          title="Nenhum pedido ainda"
          description="Assim que alguém enviar um pedido pela página da igreja, ele aparece aqui."
        />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {requests.items.map((request) => (
              <Card key={request.id}>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {request.name?.trim() || "Pedido anônimo"}
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
                </CardContent>
              </Card>
            ))}
          </div>

          <PaginationControls
            page={requests.page}
            pageSize={requests.pageSize}
            total={requests.total}
            basePath="/dashboard/prayers"
          />
        </>
      )}
    </div>
  );
}
