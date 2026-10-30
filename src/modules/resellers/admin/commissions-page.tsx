import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { markCommissionsPaidAction, updateCommissionAmountAction } from "../actions";
import { createResellerAdminRepository } from "../adminRepository";
import { requireSuperAdminPage } from "../areaAccess";
import { ActionForm, SELECT_CLASS } from "../components/action-form";
import { formatCents, formatCommission, formatDate, STATUS_LABEL } from "../format";
import { commissionFiltersSchema } from "../schemas";

const LIST_LIMIT = 200;
const BULK_FORM_ID = "marcar-pagos";

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdminPage();
  const filters = commissionFiltersSchema.parse(await searchParams);
  const repo = createResellerAdminRepository(await getSupabaseServerClient());
  const [commissions, resellers, plans] = await Promise.all([
    repo.listCommissions(filters, LIST_LIMIT),
    repo.listResellers(),
    repo.listPlans(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const exportParams = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const exportHref = `/admin/revendedores/lancamentos/exportar?${exportParams.toString()}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Lançamentos</h2>
          <p className="text-sm text-muted-foreground">
            Vendas e comissões de todos os vendedores. Mostrando até {LIST_LIMIT}, dos mais recentes.
          </p>
        </div>
        {/* <a>, não Link: é download, não navegação. */}
        <a href={exportHref} download className={buttonVariants({ variant: "outline" })}>
          <Download className="size-4" />
          Exportar comissões do mês (CSV)
        </a>
      </div>

      <Card>
        <CardContent>
          {/* GET: os filtros ficam na URL, compartilháveis e usados na exportação. */}
          <form className="grid items-end gap-3 md:grid-cols-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-reseller">Vendedor</Label>
              <select id="filter-reseller" name="reseller" defaultValue={filters.reseller ?? ""} className={SELECT_CLASS}>
                <option value="">Todos</option>
                {resellers.map((reseller) => (
                  <option key={reseller.id} value={reseller.id}>
                    {reseller.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-plan">Plano</Label>
              <select id="filter-plan" name="plan" defaultValue={filters.plan ?? ""} className={SELECT_CLASS}>
                <option value="">Todos</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-status">Status</Label>
              <select id="filter-status" name="status" defaultValue={filters.status ?? ""} className={SELECT_CLASS}>
                <option value="">Todos</option>
                <option value="pending">Pendente</option>
                <option value="paid">Pago</option>
                <option value="reversed">Revertido</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-from">De</Label>
              <Input id="filter-from" name="from" type="date" defaultValue={filters.from} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-to">Até</Label>
              <Input id="filter-to" name="to" type="date" defaultValue={filters.to} />
            </div>
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
          </form>
        </CardContent>
      </Card>

      {commissions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum lançamento com estes filtros.</p>
      ) : (
        <>
          <Card>
            <CardContent>
              <ActionForm
                id={BULK_FORM_ID}
                action={markCommissionsPaidAction}
                submitLabel="Marcar selecionados como pagos"
                className="flex flex-wrap items-end gap-3"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="paid-at">Data do pagamento</Label>
                  <Input id="paid-at" name="paidAt" type="date" defaultValue={today} required />
                </div>
              </ActionForm>
            </CardContent>
          </Card>

          {/* Uma só estrutura, que empilha no mobile: duplicar enviaria cada caixa duas vezes. */}
          <ul className="flex flex-col gap-2">
            {commissions.map((commission) => (
              <li
                key={commission.id}
                className="grid gap-2 rounded-lg border p-3 text-sm md:grid-cols-[auto_2fr_1fr_1fr_auto] md:items-center"
              >
                {commission.status === "pending" ? (
                  <input
                    type="checkbox"
                    name="ids"
                    value={commission.id}
                    form={BULK_FORM_ID}
                    aria-label={`Selecionar lançamento de ${commission.client_name}`}
                    className="size-4"
                  />
                ) : (
                  <span className="size-4" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="font-medium">{commission.client_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {commission.reseller_name} · {commission.plan_name ?? "—"} · {formatDate(commission.created_at)}
                  </p>
                </div>
                <p>
                  <span className="text-muted-foreground">Base: </span>
                  {formatCents(commission.base_amount_cents)} ({formatCommission(commission)})
                </p>
                <div>
                  <Badge variant={commission.status === "pending" ? "secondary" : "outline"}>
                    {STATUS_LABEL[commission.status]}
                  </Badge>
                  {commission.paid_at ? (
                    <span className="ml-2 text-xs text-muted-foreground">{formatDate(commission.paid_at)}</span>
                  ) : null}
                  {commission.refund_flagged_at ? (
                    <Badge variant="destructive" className="ml-2">
                      Estornado depois de pago
                    </Badge>
                  ) : null}
                </div>
                <ActionForm
                  action={updateCommissionAmountAction}
                  submitLabel="Salvar"
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="id" value={commission.id} />
                  <Input
                    name="amount"
                    inputMode="decimal"
                    aria-label={`Valor da comissão de ${commission.client_name}`}
                    defaultValue={(commission.amount_cents / 100).toFixed(2).replace(".", ",")}
                    className="w-24"
                    required
                  />
                </ActionForm>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
