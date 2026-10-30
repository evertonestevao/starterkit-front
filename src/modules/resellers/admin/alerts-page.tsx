import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { linkFromAlertAction, reprocessCommissionFailureAction } from "../actions";
import { createResellerAdminRepository } from "../adminRepository";
import { requireSuperAdminPage } from "../areaAccess";
import { ActionForm } from "../components/action-form";
import { EVENT_LABEL, formatDateTime } from "../format";

export default async function AlertsPage() {
  await requireSuperAdminPage();
  const repo = createResellerAdminRepository(await getSupabaseServerClient());
  const [alerts, failures] = await Promise.all([repo.listLinkAlerts(), repo.listPendingFailures()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Alertas e falhas</h2>
        <p className="text-sm text-muted-foreground">O que precisa da sua atenção no módulo</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vendas sem regra de comissão</CardTitle>
          <CardDescription>
            O cliente chegou por um vendedor, mas nenhuma regra se aplicava, e ele ficou sem vínculo. Crie a regra em
            Regras e planos e clique em Vincular agora. Vale só para os próximos pagamentos: o que já foi pago não gera
            comissão.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {alerts.length === 0 ? <p className="text-muted-foreground">Nenhum alerta.</p> : null}
          {alerts.map((alert) => (
            <div key={alert.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <p className="min-w-0">
                <span className="font-medium">{alert.client_name}</span> · {alert.reseller_name ?? "—"} ·{" "}
                {alert.plan_name ?? "—"} ·{" "}
                <span className="text-muted-foreground">{formatDateTime(alert.changed_at)}</span>
              </p>
              <ActionForm action={linkFromAlertAction} submitLabel="Vincular agora" variant="outline" size="sm">
                <input type="hidden" name="id" value={alert.id} />
              </ActionForm>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Falhas de comissão pendentes</CardTitle>
          <CardDescription>
            O pagamento foi processado, mas a comissão não. Reprocessar é seguro: nunca gera lançamento em dobro.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {failures.length === 0 ? <p className="text-muted-foreground">Nenhuma falha pendente.</p> : null}
          {failures.map((failure) => (
            <div key={failure.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {EVENT_LABEL[failure.event_type] ?? failure.event_type}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  Pagamento {failure.external_id} · {failure.gateway} · {failure.attempts}{" "}
                  {failure.attempts === 1 ? "tentativa" : "tentativas"} · {formatDateTime(failure.updated_at)}
                </p>
                <p className="text-xs text-destructive">{failure.error}</p>
              </div>
              <ActionForm action={reprocessCommissionFailureAction} submitLabel="Reprocessar" variant="outline" size="sm">
                <input type="hidden" name="id" value={failure.id} />
              </ActionForm>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
