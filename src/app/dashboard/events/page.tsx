import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarPlus, CheckCircle2, ListChecks, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { EventAdminForms } from "@/features/church/components/event-admin-forms";
import { PaginationControls } from "@/components/pagination-controls";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { eventDateBadge, eventPrice, eventWhen } from "@/lib/churchEvents";
import { cn } from "@/lib/utils";
import { getChurchEventsService } from "@/server/churchEvents";
import { getCommunityService } from "@/server/community";
import { getActiveTenant } from "@/server/tenant";
import { canManageEvents, type CompanyEvent } from "@/services/churchEventsService";

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

/** Linha de evento: data, nome, preço e inscritos. Tocar filtra a lista. */
function LinhaEvento({
  evento,
  ativo,
  podeEditar,
}: {
  evento: CompanyEvent;
  ativo: boolean;
  podeEditar: boolean;
}) {
  const selo = eventDateBadge(evento.inicio);
  return (
    <div className={cn("rounded-lg border", ativo && "border-primary bg-primary/5")}>
      <Link
        href={`/dashboard/events?evento=${evento.id}#inscricoes`}
        aria-current={ativo ? "true" : undefined}
        className="flex items-center gap-3 p-3 transition-colors hover:bg-muted"
      >
      <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg bg-secondary text-primary">
        <span className="text-lg leading-none font-semibold">{selo.dia}</span>
        <span className="mt-0.5 text-[0.65rem] font-semibold tracking-wider">{selo.mes}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{evento.titulo}</span>
        <span className="block text-xs text-muted-foreground">
          {eventWhen(evento.inicio, evento.fim)} · {eventPrice(evento.precoCents)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums">
          {evento.inscritos} {evento.inscritos === 1 ? "inscrito" : "inscritos"}
        </span>
        {!evento.inscricoesAbertas ? (
          <Badge variant="outline" className="text-[0.65rem]">
            Encerradas
          </Badge>
        ) : null}
      </span>
      </Link>
      {/* Fechado por padrão: a lista serve para achar o evento, não para
          editá-lo o tempo todo. */}
      {podeEditar ? (
        <details>
          <summary className="cursor-pointer px-3 pb-2 text-xs text-muted-foreground">
            Editar ou remover
          </summary>
          <EventAdminForms evento={evento} />
        </details>
      ) : null}
    </div>
  );
}

/**
 * Eventos da igreja — o que tem inscrição e/ou pagamento. A programação do dia
 * a dia (cultos semanais, culto especial) é outra tela: não tem inscrição.
 * Aqui ficam os eventos publicados (com inscritos por evento) e a lista de
 * inscrições, filtrável por evento. O filtro vive na URL
 * (?evento=), então dá para mandar o link já filtrado para quem organiza.
 */
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; evento?: string; criado?: string }>;
}) {
  const { active } = await getActiveTenant();
  if (!active) return null;

  const { page, evento: eventoFiltro, criado } = await searchParams;
  const community = await getCommunityService();
  const [{ todos: eventos, proximos, anteriores }, signups, counts] = await Promise.all([
    (await getChurchEventsService()).getAgenda(active.id),
    community.listEventSignups(active.id, { page: Number(page) || 1, eventId: eventoFiltro }),
    community.getCounts(active.id),
  ]);

  // O filtro só vale se o evento é desta igreja; senão, lista tudo.
  const selecionado = eventos.find((e) => e.id === eventoFiltro) ?? null;
  const podePublicar = canManageEvents(active.role);


  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <CalendarDays className="size-4" /> Inscrições e pagamentos
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Eventos</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            O que você publica aqui aparece na página da igreja, e as inscrições chegam nesta tela.
          </p>
        </div>
        {podePublicar ? (
          <Link href="/dashboard/events/novo" className={cn(buttonVariants(), "gap-2 self-start sm:self-auto")}>
            <CalendarPlus className="size-4" />
            Novo evento
          </Link>
        ) : null}
      </div>

      {criado && selecionado ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            “{selecionado.titulo}” publicado. Ele já aparece na página da igreja.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={CalendarDays}
          label="Próximos eventos"
          value={proximos.length}
          hint="publicados na página da igreja"
        />
        <MetricCard
          icon={ListChecks}
          label="Inscrições recebidas"
          value={counts.eventSignups}
          hint="desde o início"
        />
        <MetricCard
          icon={Users}
          label="Nos últimos 7 dias"
          value={counts.lastWeek}
          hint="oração, eventos e visitas"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Seus eventos</CardTitle>
          <CardDescription>Toque num evento para ver só os inscritos dele.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {proximos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum evento agendado.{" "}
              {podePublicar ? (
                <Link href="/dashboard/events/novo" className="font-medium text-primary underline-offset-4 hover:underline">
                  Publicar o primeiro
                </Link>
              ) : null}
            </p>
          ) : (
            proximos.map((e) => (
              <LinhaEvento key={e.id} evento={e} ativo={e.id === selecionado?.id} podeEditar={podePublicar} />
            ))
          )}

          {anteriores.length > 0 ? (
            <details className="group mt-2">
              <summary className="cursor-pointer text-sm text-muted-foreground select-none hover:text-foreground">
                Eventos anteriores ({anteriores.length})
              </summary>
              <div className="mt-2 flex flex-col gap-2 opacity-80">
                {anteriores.map((e) => (
                  <LinhaEvento
                    key={e.id}
                    evento={e}
                    ativo={e.id === selecionado?.id}
                    podeEditar={podePublicar}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <section id="inscricoes" className="flex scroll-mt-4 flex-col gap-4">
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold">Inscrições</h3>
          {/* Filtro por links: funciona sem JS, e o evento escolhido fica na URL. */}
          <nav aria-label="Filtrar inscrições por evento" className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/events#inscricoes"
              aria-current={!selecionado ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                !selecionado ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              Todos · {counts.eventSignups}
            </Link>
            {eventos
              .filter((e) => e.inscritos > 0 || e.id === selecionado?.id)
              .map((e) => (
                <Link
                  key={e.id}
                  href={`/dashboard/events?evento=${e.id}#inscricoes`}
                  aria-current={e.id === selecionado?.id ? "true" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    e.id === selecionado?.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {e.titulo} · {e.inscritos}
                </Link>
              ))}
          </nav>
          {selecionado ? (
            <p className="text-sm text-muted-foreground">
              {eventWhen(selecionado.inicio, selecionado.fim)} · {eventPrice(selecionado.precoCents)}
            </p>
          ) : null}
        </div>

        {signups.items.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={selecionado ? "Ninguém inscrito ainda" : "Nenhuma inscrição ainda"}
            description={
              selecionado
                ? "Quando alguém se inscrever pela página da igreja, aparece aqui."
                : "Publique um evento: as inscrições feitas pela página da igreja aparecem aqui."
            }
          />
        ) : (
          <>
            {/* Desktop: tabela. Mobile: cards (regra de layout do projeto). */}
            <div className="hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    {selecionado ? null : <TableHead>Evento</TableHead>}
                    <TableHead>Contato</TableHead>
                    <TableHead className="text-right">Recebida em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signups.items.map((signup) => (
                    <TableRow key={signup.id}>
                      <TableCell className="font-medium">{signup.person_name}</TableCell>
                      {selecionado ? null : (
                        <TableCell className="text-muted-foreground">{signup.event_name}</TableCell>
                      )}
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
                    {selecionado ? null : (
                      <p className="text-sm text-muted-foreground">{signup.event_name}</p>
                    )}
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
              params={{ evento: selecionado?.id }}
            />
          </>
        )}
      </section>

    </div>
  );
}
