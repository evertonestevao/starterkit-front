import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AddScheduleItemForm,
  EditScheduleItemForm,
  RemoveScheduleItemButton,
} from "@/features/church/components/schedule-forms";
import { formatHora, groupWeekly, specialBadge, specialWhen, upcomingSpecials } from "@/lib/churchSchedule";
import { getChurchScheduleService } from "@/server/churchSchedule";
import { getActiveTenant } from "@/server/tenant";
import { canManageEvents } from "@/services/churchEventsService";
import type { ScheduleItemWithChurch } from "@/services/churchScheduleService";

export const metadata: Metadata = { title: "Programação" };

function Detalhes({ item, mostrarIgreja }: { item: ScheduleItemWithChurch; mostrarIgreja: boolean }) {
  const extras = [item.local, item.descricao, mostrarIgreja ? item.churchName : null].filter(Boolean);
  if (extras.length === 0) return null;
  return (
    <span className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
      {item.local ? <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden /> : null}
      {extras.join(" · ")}
    </span>
  );
}

/**
 * Programação da igreja: o dia a dia. Cultos que se repetem toda semana e os
 * cultos especiais avulsos. Não tem inscrição — o que precisa de inscrição ou
 * pagamento é Eventos, em outra tela.
 */
export default async function SchedulePage() {
  const { active } = await getActiveTenant();
  if (!active) return null;

  const service = await getChurchScheduleService();
  const podeEditar = canManageEvents(active.role);
  const [itens, igrejas] = await Promise.all([
    service.list(active.id),
    podeEditar ? service.listChurches(active.id) : Promise.resolve([]),
  ]);

  const semana = groupWeekly(itens);
  const especiais = upcomingSpecials(itens);
  const variasIgrejas = new Set(itens.map((i) => i.church_id)).size > 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <CalendarClock className="size-4" /> O dia a dia da igreja
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Programação</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Cultos e encontros que se repetem toda semana, e os cultos especiais. Aparece na página
          da igreja e não tem inscrição — para o que precisa de inscrição ou pagamento, use{" "}
          <Link href="/dashboard/events" className="font-medium text-primary underline-offset-4 hover:underline">
            Eventos
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Toda semana</CardTitle>
            <CardDescription>O que se repete no mesmo dia e horário.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {semana.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada cadastrado ainda.</p>
            ) : (
              semana.map((d) => (
                <div key={d.dia}>
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{d.rotulo}</p>
                  <ul className="mt-1.5 divide-y rounded-lg border">
                    {d.itens.map((item) => (
                      <li key={item.id} className="flex flex-col">
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <span className="w-12 shrink-0 font-semibold tabular-nums">{formatHora(item.hora)}</span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate font-medium">{item.titulo}</span>
                            <Detalhes item={item} mostrarIgreja={variasIgrejas} />
                          </span>
                          {podeEditar ? <RemoveScheduleItemButton itemId={item.id} titulo={item.titulo} /> : null}
                        </div>
                        {/* Edição fechada por padrão: a lista existe para ser
                            lida de relance, não para ser preenchida. */}
                        {podeEditar ? (
                          <details>
                            <summary className="cursor-pointer px-3 pb-2 text-xs text-muted-foreground">
                              Editar
                            </summary>
                            <EditScheduleItemForm item={item} />
                          </details>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cultos especiais</CardTitle>
            <CardDescription>Acontecem numa data só. Os que já passaram saem daqui.</CardDescription>
          </CardHeader>
          <CardContent>
            {especiais.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum culto especial marcado.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {especiais.map((item) => {
                  const selo = specialBadge(item.data!);
                  return (
                    <li key={item.id} className="flex flex-col rounded-lg border">
                      <div className="flex items-center gap-3 p-3">
                      <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-secondary text-primary">
                        <span className="text-base leading-none font-semibold">{selo.dia}</span>
                        <span className="mt-0.5 text-[0.6rem] font-semibold tracking-wider">{selo.mes}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{item.titulo}</span>
                        <span className="text-xs text-muted-foreground">{specialWhen(item.data!, item.hora)}</span>
                        <Detalhes item={item} mostrarIgreja={variasIgrejas} />
                      </span>
                        {podeEditar ? (
                          <RemoveScheduleItemButton itemId={item.id} titulo={item.titulo} />
                        ) : null}
                      </div>
                      {podeEditar ? (
                        <details>
                          <summary className="cursor-pointer px-3 pb-2 text-xs text-muted-foreground">
                            Editar
                          </summary>
                          <EditScheduleItemForm item={item} />
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {podeEditar && igrejas.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Adicionar à programação</CardTitle>
            <CardDescription>
              Culto especial também entra aqui — como{" "}
              <Badge variant="secondary">Data específica</Badge>. Só vira evento se precisar de
              inscrição.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddScheduleItemForm igrejas={igrejas} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
