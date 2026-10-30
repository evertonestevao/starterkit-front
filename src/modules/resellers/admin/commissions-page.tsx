import Link from "next/link";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { updateCommissionAmountAction } from "../actions";
import { createResellerAdminRepository } from "../adminRepository";
import { requireSuperAdminPage } from "../areaAccess";
import { ActionForm, SELECT_CLASS } from "../components/action-form";
import { BulkPaidBar } from "../components/bulk-paid-bar";
import { StatCards } from "../components/stat-cards";
import { formatCents, formatCommission, formatDate, STATUS_LABEL } from "../format";
import { commissionFiltersSchema } from "../schemas";

const LIST_LIMIT = 200;
const BULK_FORM_ID = "marcar-pagos";
const LIST_PATH = "/admin/revendedores/lancamentos";

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
  const activeFilters = Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1]));
  const exportHref = `${LIST_PATH}/exportar?${new URLSearchParams(activeFilters).toString()}`;

  const sumBy = (status: string) =>
    commissions.filter((c) => c.status === status).reduce((total, c) => total + c.amount_cents, 0);
  const pendingCount = commissions.filter((c) => c.status === "pending").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Lançamentos</h2>
          <p className="text-sm text-muted-foreground">Vendas e comissões de todos os vendedores</p>
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
          <form className="grid items-end gap-3 md:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
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
            <div className="flex gap-2">
              <Button type="submit" variant="outline">
                Filtrar
              </Button>
              {activeFilters.length > 0 ? (
                <Link href={LIST_PATH} className={buttonVariants({ variant: "ghost" })}>
                  Limpar
                </Link>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {commissions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum lançamento com estes filtros.</p>
      ) : (
        <>
          <StatCards
            stats={[
              { label: "Pendente nesta lista", value: formatCents(sumBy("pending")) },
              { label: "Pago nesta lista", value: formatCents(sumBy("paid")) },
              { label: "Lançamentos", value: String(commissions.length) },
            ]}
          />

          {commissions.length === LIST_LIMIT ? (
            <p className="text-sm text-muted-foreground">
              Mostrando os {LIST_LIMIT} mais recentes, e os totais acima consideram só eles. Filtre para ver o resto; a
              exportação traz todos.
            </p>
          ) : null}

          <Card>
            <CardContent>
              <BulkPaidBar formId={BULK_FORM_ID} today={today} selectable={pendingCount} key={pendingCount} />
            </CardContent>
          </Card>

          {/* Uma só estrutura, que empilha no mobile: duplicar enviaria cada caixa duas vezes. */}
          <ul className="flex flex-col gap-2">
            {commissions.map((commission) => (
              <li
                key={commission.id}
                className="grid gap-2 rounded-lg border p-3 text-sm md:grid-cols-[auto_2fr_1.2fr_1fr_1fr] md:items-center"
              >
                {commission.status === "pending" ? (
                  <input
                    type="checkbox"
                    name="ids"
                    value={commission.id}
                    form={BULK_FORM_ID}
                    data-cents={commission.amount_cents}
                    aria-label={`Selecionar lançamento de ${commission.client_name}`}
                    className="size-4"
                  />
                ) : (
                  <span className="hidden size-4 md:block" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="font-medium">{commission.client_name}</p>
                  <p className="text-xs text-muted-foreground">
                    <Link href={`/admin/revendedores/${commission.reseller_id}`} className="hover:underline">
                      {commission.reseller_name}
                    </Link>{" "}
                    · {commission.plan_name ?? "—"} · {formatDate(commission.created_at)}
                  </p>
                </div>
                <p>
                  <span className="font-medium">{formatCents(commission.amount_cents)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatCommission(commission)}
                    {commission.commission_type === "percent" ? ` sobre ${formatCents(commission.base_amount_cents)}` : null}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={commission.status === "pending" ? "secondary" : "outline"}>
                    {STATUS_LABEL[commission.status]}
                  </Badge>
                  {commission.paid_at ? (
                    <span className="text-xs text-muted-foreground">{formatDate(commission.paid_at)}</span>
                  ) : null}
                  {commission.refund_flagged_at ? <Badge variant="destructive">Estornado depois de pago</Badge> : null}
                </div>
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Corrigir valor
                  </summary>
                  <ActionForm
                    action={updateCommissionAmountAction}
                    submitLabel="Salvar"
                    variant="outline"
                    size="sm"
                    className="mt-2 flex flex-wrap items-center gap-2"
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
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
