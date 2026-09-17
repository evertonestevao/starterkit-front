import type { Metadata } from "next";
import { CalendarDays, ListChecks, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PaginationControls } from "@/components/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { groupSignupsByEvent } from "@/services/communityService";

export const metadata: Metadata = { title: "Eventos" };

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

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { active } = await getActiveTenant();
  if (!active) return null;

  const { page } = await searchParams;
  const community = await getCommunityService();
  const [signups, counts] = await Promise.all([
    community.listEventSignups(active.id, { page: Number(page) || 1 }),
    community.getCounts(active.id),
  ]);
  const byEvent = groupSignupsByEvent(signups.items);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <CalendarDays className="size-4" /> Quem quer participar
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Inscrições em eventos</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Chegam pela página pública da igreja. Use o contato para confirmar presença e receber
          bem quem vem pela primeira vez.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={ListChecks}
          label="Inscrições recebidas"
          value={counts.eventSignups}
          hint="desde o início"
        />
        <MetricCard
          icon={CalendarDays}
          label="Eventos nesta página"
          value={byEvent.length}
          hint="com pelo menos uma inscrição"
        />
        <MetricCard
          icon={Users}
          label="Nos últimos 7 dias"
          value={counts.lastWeek}
          hint="oração, eventos e visitas"
        />
      </div>

      {signups.items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhuma inscrição ainda"
          description="Divulgue a página da igreja: as inscrições feitas por lá aparecem aqui."
        />
      ) : (
        <>
          {byEvent.length > 1 ? (
            <Card>
              <CardHeader>
                <CardTitle>Por evento</CardTitle>
                <CardDescription>Inscrições desta página, agrupadas.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {byEvent.map((event) => (
                  <Badge key={event.eventName} variant="secondary" className="h-auto py-1">
                    {event.eventName} · {event.count}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {/* Desktop: tabela. Mobile: cards (regra de layout do projeto). */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead className="text-right">Recebida em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signups.items.map((signup) => (
                  <TableRow key={signup.id}>
                    <TableCell className="font-medium">{signup.person_name}</TableCell>
                    <TableCell className="text-muted-foreground">{signup.event_name}</TableCell>
                    <TableCell>{signup.contact}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDateTime(signup.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {signups.items.map((signup) => (
              <Card key={signup.id}>
                <CardContent className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium">{signup.person_name}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(signup.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{signup.event_name}</p>
                  <p className="text-sm">{signup.contact}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <PaginationControls
            page={signups.page}
            pageSize={signups.pageSize}
            total={signups.total}
            basePath="/dashboard/events"
          />
        </>
      )}
    </div>
  );
}
