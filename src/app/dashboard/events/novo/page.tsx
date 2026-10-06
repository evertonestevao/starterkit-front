import type { Metadata } from "next";
import { CalendarPlus, Lock } from "lucide-react";
import { BotaoVoltar } from "@/components/botao-voltar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { NewEventForm } from "@/features/church/components/new-event-form";
import { getChurchEventsService } from "@/server/churchEvents";
import { getActiveTenant } from "@/server/tenant";
import { canManageEvents } from "@/services/churchEventsService";

export const metadata: Metadata = { title: "Novo evento" };

export default async function NewEventPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // o layout já redirecionou

  const podePublicar = canManageEvents(active.role, active.acessos.includes("events"));
  const igrejas = podePublicar ? await (await getChurchEventsService()).listChurches(active.id) : [];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <BotaoVoltar href="/dashboard/events" />
        <div className="mt-4 flex items-center gap-2 text-sm font-medium text-primary">
          <CalendarPlus className="size-4" /> Eventos com inscrição
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Novo evento</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Depois de publicado, o evento aparece na página da igreja e as pessoas já podem se
          inscrever.
        </p>
      </div>

      {!podePublicar ? (
        // Membro vê a explicação em vez de um formulário que o banco recusaria.
        <Alert>
          <Lock className="size-4" />
          <AlertDescription>
            Só quem administra a igreja pode publicar eventos. Peça a um administrador.
          </AlertDescription>
        </Alert>
      ) : igrejas.length === 0 ? (
        <Alert>
          <AlertDescription>Nenhuma igreja encontrada nesta conta.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent>
            <NewEventForm
              igrejas={igrejas.map(({ id, name }) => ({ id, name }))}
              endereco={igrejas.length === 1 ? igrejas[0].address : null}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
