import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { reprocessCommissionFailureAction } from "../actions";
import { createResellerAdminRepository } from "../adminRepository";
import { requireSuperAdminPage } from "../areaAccess";
import { ActionForm } from "../components/action-form";
import { formatDateTime } from "../format";

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
            O cliente chegou por um vendedor, mas nenhuma regra se aplicava. Ele não foi vinculado e não gera
            comissão: crie a regra para as próximas vendas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {alerts.length === 0 ? <p className="text-muted-foreground">Nenhum alerta.</p> : null}
          {alerts.map((alert) => (
            <p key={alert.id} className="rounded-lg border p-3">
              <span className="font-medium">{alert.client_name}</span> · {alert.reseller_name ?? "—"} ·{" "}
              {alert.plan_name ?? "—"} · <span className="text-muted-foreground">{formatDateTime(alert.changed_at)}</span>
            </p>
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
                  {failure.gateway} · {failure.event_type}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {failure.external_id} · {failure.attempts} tentativa(s) · {formatDateTime(failure.updated_at)}
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
