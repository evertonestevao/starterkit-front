import type { Metadata } from "next";
import { CalendarClock, HeartHandshake, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCommunityService } from "@/server/community";
import { getActiveTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Relacionamentos" };

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

export default async function RelationshipsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { active } = await getActiveTenant();
  if (!active) return null;

  const { page } = await searchParams;
  const community = await getCommunityService();
  const [visitors, counts] = await Promise.all([
    community.listVisitors(active.id, { page: Number(page) || 1 }),
    community.getCounts(active.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <HeartHandshake className="size-4" /> Pessoas antes de números
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Quem quer visitar</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Gente que deixou o contato na página da igreja dizendo que quer conhecer. Um retorno
          rápido aqui é a diferença entre uma visita e um silêncio.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={UserPlus}
          label="Contatos recebidos"
          value={counts.visitors}
          hint="desde o início"
        />
        <MetricCard
          icon={CalendarClock}
          label="Nos últimos 7 dias"
          value={counts.lastWeek}
          hint="oração, eventos e visitas"
        />
        <MetricCard
          icon={HeartHandshake}
          label="Nesta página"
          value={visitors.items.length}
          hint={`de ${visitors.total}`}
        />
      </div>

      {visitors.items.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Ninguém deixou contato ainda"
          description="Quando alguém pedir uma visita pela página da igreja, o contato aparece aqui."
        />
      ) : (
        <>
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead className="text-right">Recebido em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitors.items.map((visitor) => (
                  <TableRow key={visitor.id}>
                    <TableCell className="font-medium">{visitor.name}</TableCell>
                    <TableCell>{visitor.contact}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDateTime(visitor.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {visitors.items.map((visitor) => (
              <Card key={visitor.id}>
                <CardContent className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium">{visitor.name}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(visitor.created_at)}
                    </span>
                  </div>
                  <p className="text-sm">{visitor.contact}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <PaginationControls
            page={visitors.page}
            pageSize={visitors.pageSize}
            total={visitors.total}
            basePath="/dashboard/relationships"
          />
        </>
      )}
    </div>
  );
}
