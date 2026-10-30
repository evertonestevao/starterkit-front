import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getServerEnv } from "@/config/env";
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
import { CopyLinkButton } from "../components/copy-link-button";
import { StatCards } from "../components/stat-cards";
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
    repo.listCommissions({ reseller: id }, 10),
  ]);
  const clientName = new Map(clients.map((client) => [client.id, client.client_name]));
  // A criação do vínculo não é alteração: o histórico mostra só o que mudou depois.
  const history = (await repo.listHistory("reseller_clients", clients.map((client) => client.id)))
    .map((entry) => ({ entry, changes: describeChanges(entry) }))
    .filter(({ entry, changes }) => entry.action === "UPDATE" && changes.length > 0);

  const isActive = reseller.status === "active";
  const link = `${getServerEnv().APP_URL.replace(/\/+$/, "")}/r/${reseller.referral_code}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
          {reseller.name}
          <Badge variant={isActive ? "secondary" : "destructive"}>{isActive ? "Ativo" : "Suspenso"}</Badge>
        </h2>
        <p className="text-sm text-muted-foreground">{reseller.email}</p>
      </div>

      <StatCards
        stats={[
          { label: "Clientes ativos", value: String(reseller.active_clients) },
          { label: "Comissão pendente", value: formatCents(reseller.pending_cents) },
          { label: "Comissão paga", value: formatCents(reseller.paid_cents) },
        ]}
      />

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
                <p className="text-xs text-muted-foreground">Trocar o código desativa os links já divulgados.</p>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Link do vendedor</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <code className="min-w-0 break-all text-sm">{link}</code>
              <CopyLinkButton link={link} label="Copiar link do vendedor" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acesso</CardTitle>
              <CardDescription>
                Suspender bloqueia o painel e novas vendas. Os lançamentos ficam, e os clientes atuais continuam gerando
                comissão.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <ActionForm
                action={setResellerStatusAction}
                submitLabel={isActive ? "Suspender vendedor" : "Reativar vendedor"}
                variant={isActive ? "destructive" : "default"}
                confirm={
                  isActive
                    ? {
                        title: `Suspender ${reseller.name}?`,
                        description: "O vendedor perde o acesso ao painel e o link dele para de funcionar.",
                        confirmLabel: "Suspender",
                      }
                    : undefined
                }
              >
                <input type="hidden" name="id" value={reseller.id} />
                <input type="hidden" name="status" value={isActive ? "suspended" : "active"} />
              </ActionForm>
              {reseller.has_account ? (
                <ActionForm action={resendResellerInviteAction} submitLabel="Reenviar convite" variant="outline">
                  <input type="hidden" name="id" value={reseller.id} />
                </ActionForm>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="font-medium">Clientes ({clients.length})</h3>
        {clients.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum cliente ainda.</p> : null}
        {clients.map((client) => (
          <div key={client.id} className="rounded-lg border p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {client.client_name}
              {client.is_override ? <Badge variant="secondary">Ajuste manual</Badge> : null}
              {client.ended_at ? <Badge variant="outline">Encerrado</Badge> : null}
            </p>
            <p className="text-muted-foreground">
              {client.plan_name ?? "—"} · venda nº {client.sale_number} · {formatCommission(client)} ·{" "}
              {formatDuration(client.duration_months)}
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Ajustar comissão
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Vale só para os próximos lançamentos. Para corrigir um mês já lançado, use Lançamentos.
              </p>
              <ActionForm
                action={updateClientCommissionAction}
                submitLabel="Salvar ajuste"
                variant="outline"
                className="mt-2 grid items-end gap-3 md:grid-cols-4"
              >
                <input type="hidden" name="id" value={client.id} />
                <CommissionFields
                  idPrefix={`client-${client.id}`}
                  defaults={{
                    type: client.commission_type,
                    value:
                      client.commission_type === "percent"
                        ? String(client.commission_percent)
                        : String((client.commission_fixed_cents ?? 0) / 100).replace(".", ","),
                    durationMonths: client.duration_months,
                  }}
                />
              </ActionForm>
            </details>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Últimos lançamentos</h3>
          {commissions.length > 0 ? (
            <Link
              href={`/admin/revendedores/lancamentos?reseller=${reseller.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Ver todos e marcar como pagos
            </Link>
          ) : null}
        </div>
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

      <section className="flex flex-col gap-3">
        <h3 className="font-medium">Histórico de alterações</h3>
        {history.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma alteração manual.</p> : null}
        <ul className="flex flex-col gap-2 text-sm">
          {history.map(({ entry, changes }) => (
            <li key={entry.id} className="rounded-lg border p-3">
              <p className="font-medium">
                {clientName.get(entry.record_id ?? "") ?? "Cliente"} · {entry.changed_by ? "Super admin" : "Sistema"} ·{" "}
                <span className="font-normal text-muted-foreground">{formatDateTime(entry.changed_at)}</span>
              </p>
              <ul className="text-muted-foreground">
                {changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
