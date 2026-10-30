import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseServerClient } from "@/server/supabase-server";
import {
  createCommissionRuleAction,
  deleteCommissionRuleAction,
  setPlanAvailabilityAction,
} from "../actions";
import { createResellerAdminRepository } from "../adminRepository";
import { requireSuperAdminPage } from "../areaAccess";
import { ActionForm, SELECT_CLASS } from "../components/action-form";
import { CommissionFields } from "../components/commission-fields";
import { formatCents, formatCommission, formatDuration } from "../format";

export default async function RulesPage() {
  await requireSuperAdminPage();
  const repo = createResellerAdminRepository(await getSupabaseServerClient());
  const [rules, plans, resellers] = await Promise.all([repo.listRules(), repo.listPlans(), repo.listResellers()]);
  const resellerName = new Map(resellers.map((reseller) => [reseller.id, reseller.name]));
  const planName = new Map(plans.map((plan) => [plan.id, plan.name]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Regras e planos</h2>
        <p className="text-sm text-muted-foreground">
          Vale a regra mais específica: de um vendedor antes da que vale para todos; de um plano antes da que vale
          para todos os planos; e, por fim, a maior faixa que a venda alcança. Mudar regras não altera clientes já
          vinculados.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planos para revendedores</CardTitle>
          <CardDescription>Esconder afeta só novas vendas: clientes antigos continuam gerando comissão.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {plans.filter((plan) => plan.price_cents > 0).map((plan) => (
            <div key={plan.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                <span className="font-medium">{plan.name}</span>{" "}
                <span className="text-muted-foreground">{formatCents(plan.price_cents)}</span>{" "}
                {plan.available_to_resellers ? <Badge>Liberado</Badge> : <Badge variant="outline">Escondido</Badge>}
              </span>
              <ActionForm
                action={setPlanAvailabilityAction}
                submitLabel={plan.available_to_resellers ? `Esconder ${plan.name}` : `Liberar ${plan.name}`}
                variant="outline"
                size="sm"
              >
                <input type="hidden" name="id" value={plan.id} />
                <input type="hidden" name="available" value={String(!plan.available_to_resellers)} />
              </ActionForm>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nova regra</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={createCommissionRuleAction}
            submitLabel="Criar regra"
            resetOnSuccess
            className="grid items-end gap-3 md:grid-cols-3"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="rule-reseller">Vendedor</Label>
              <select id="rule-reseller" name="resellerId" className={SELECT_CLASS}>
                <option value="">Todos (padrão global)</option>
                {resellers.map((reseller) => (
                  <option key={reseller.id} value={reseller.id}>
                    {reseller.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rule-plan">Plano</Label>
              <select id="rule-plan" name="planId" className={SELECT_CLASS}>
                <option value="">Todos</option>
                {plans.filter((plan) => plan.price_cents > 0).map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rule-from">A partir da venda nº (opcional)</Label>
              <Input id="rule-from" name="fromSaleNumber" type="number" min={1} placeholder="1" />
            </div>
            <CommissionFields idPrefix="rule" />
          </ActionForm>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h3 className="font-medium">Regras ativas</h3>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma regra: sem regra aplicável, a venda não gera vínculo e aparece em Alertas e falhas.
          </p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <span>
                <span className="font-medium">{formatCommission(rule)}</span> ·{" "}
                {rule.reseller_id ? resellerName.get(rule.reseller_id) : "Todos os vendedores"} ·{" "}
                {rule.plan_id ? planName.get(rule.plan_id) : "Todos os planos"} · a partir da venda {rule.from_sale_number} ·{" "}
                {formatDuration(rule.duration_months)}
              </span>
              <ActionForm
                action={deleteCommissionRuleAction}
                submitLabel="Remover"
                variant="outline"
                size="sm"
                confirm={{
                  title: "Remover esta regra?",
                  description: "Clientes já vinculados não mudam, mas as próximas vendas deixam de usá-la.",
                  confirmLabel: "Remover",
                }}
              >
                <input type="hidden" name="id" value={rule.id} />
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
