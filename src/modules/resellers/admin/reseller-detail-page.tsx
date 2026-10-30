import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseServerClient } from "@/server/supabase-server";
import {
  resendResellerInviteAction,
  setResellerStatusAction,
  updateClientCommissionAction,
  updateResellerAction,
} from "../actions";
import { createResellerAdminRepository } from "../adminRepository";
import { requireSuperAdminPage } from "../areaAccess";
import { ActionForm } from "../components/action-form";
import { CommissionFields } from "../components/commission-fields";
import {
  describeChanges,
  formatCents,
  formatCommission,
  formatDate,
  formatDateTime,
  formatDuration,
  STATUS_LABEL,
} from "../format";

export default async function ResellerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdminPage();
  const { id } = await params;
  const repo = createResellerAdminRepository(await getSupabaseServerClient());
  const reseller = /^[0-9a-f-]{36}$/i.test(id) ? await repo.getReseller(id) : null;
  if (!reseller) notFound();

  const [clients, commissions] = await Promise.all([
    repo.listClients(id),
    repo.listCommissions({ reseller: id }, 50),
  ]);
  const history = await repo.listHistory("reseller_clients", clients.map((client) => client.id));
  const clientName = new Map(clients.map((client) => [client.id, client.client_name]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{reseller.name}</h2>
        <p className="text-sm text-muted-foreground">
          {reseller.email} · {reseller.active_clients} clientes ativos · {formatCents(reseller.pending_cents)} pendente ·{" "}
          {formatCents(reseller.paid_cents)} pago
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dados</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateResellerAction} submitLabel="Salvar dados">
              <input type="hidden" name="id" value={reseller.id} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-name">Nome</Label>
                <Input id="edit-name" name="name" defaultValue={reseller.name} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-code">Código de indicação</Label>
                <Input id="edit-code" name="referralCode" defaultValue={reseller.referral_code} required />
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acesso</CardTitle>
            <CardDescription>
              Suspender bloqueia o painel e novas vendas. Os lançamentos ficam preservados.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <ActionForm
              action={setResellerStatusAction}
              submitLabel={reseller.status === "active" ? "Suspender vendedor" : "Reativar vendedor"}
              variant={reseller.status === "active" ? "destructive" : "default"}
            >
              <input type="hidden" name="id" value={reseller.id} />
              <input type="hidden" name="status" value={reseller.status === "active" ? "suspended" : "active"} />
            </ActionForm>
            {reseller.has_account ? (
              <ActionForm action={resendResellerInviteAction} submitLabel="Reenviar convite" variant="outline">
                <input type="hidden" name="id" value={reseller.id} />
              </ActionForm>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="font-medium">Clientes</h3>
        {clients.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum cliente ainda.</p> : null}
        {clients.map((client) => (
          <Card key={client.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {client.client_name}
                {client.is_override ? <Badge variant="secondary">Ajuste manual</Badge> : null}
                {client.ended_at ? <Badge variant="outline">Encerrado</Badge> : null}
              </CardTitle>
              <CardDescription>
                {client.plan_name ?? "—"} · venda nº {client.sale_number} · {formatCommission(client)} ·{" "}
                {formatDuration(client.duration_months)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm
                action={updateClientCommissionAction}
                submitLabel="Ajustar comissão"
                variant="outline"
                className="grid items-end gap-3 md:grid-cols-4"
              >
                <input type="hidden" name="id" value={client.id} />
                <CommissionFields
                  idPrefix={`client-${client.id}`}
                  defaults={{
                    type: client.commission_type,
                    value:
                      client.commission_type === "percent"
                        ? String(client.commission_percent)
                        : String((client.commission_fixed_cents ?? 0) / 100),
                    durationMonths: client.duration_months,
                  }}
                />
              </ActionForm>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-medium">Histórico de alterações</h3>
        {history.length === 0 ? <p className="text-sm text-muted-foreground">Sem alterações.</p> : null}
        <ul className="flex flex-col gap-2 text-sm">
          {history.map((entry) => (
            <li key={entry.id} className="rounded-lg border p-3">
              <p className="font-medium">
                {clientName.get(entry.record_id ?? "") ?? "Cliente"} · {entry.changed_by ? "Super admin" : "Sistema"} ·{" "}
                <span className="font-normal text-muted-foreground">{formatDateTime(entry.changed_at)}</span>
              </p>
              <ul className="text-muted-foreground">
                {describeChanges(entry).map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-medium">Últimos lançamentos</h3>
        {commissions.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum lançamento.</p> : null}
        <ul className="flex flex-col gap-2 text-sm">
          {commissions.map((commission) => (
            <li key={commission.id} className="grid gap-1 rounded-lg border p-3 md:grid-cols-4">
              <span className="font-medium">{commission.client_name}</span>
              <span>{formatCents(commission.amount_cents)}</span>
              <span>{STATUS_LABEL[commission.status]}</span>
              <span className="text-muted-foreground">{formatDate(commission.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
