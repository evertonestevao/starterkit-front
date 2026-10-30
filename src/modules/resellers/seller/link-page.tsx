import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerEnv } from "@/config/env";
import { requireSellerPage } from "../areaAccess";
import { CopyLinkButton } from "../components/copy-link-button";
import { formatCents } from "../format";
import { createSellerRepository } from "../sellerRepository";

export default async function SellerLinkPage() {
  await requireSellerPage();
  const repo = await createSellerRepository();
  const [me, enabled, plans] = await Promise.all([repo.getMe(), repo.isModuleEnabled(), repo.listAvailablePlans()]);
  if (!me) return null;

  const base = getServerEnv().APP_URL.replace(/\/+$/, "");
  const generalLink = `${base}/r/${me.referral_code}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Meu link</h2>
        <p className="text-sm text-muted-foreground">Quem contrata por um destes links fica vinculado a você.</p>
      </div>

      {!enabled ? (
        <Alert>
          <AlertDescription>
            As novas vendas estão pausadas no momento, então os links não estão disponíveis. Seus clientes e
            comissões continuam normais.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Link geral</CardTitle>
              <CardDescription>Código {me.referral_code}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <code className="min-w-0 break-all text-sm">{generalLink}</code>
              <CopyLinkButton link={generalLink} label="Copiar link geral" />
            </CardContent>
          </Card>

          <section className="flex flex-col gap-3">
            <h3 className="font-medium">Por plano</h3>
            {plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum plano liberado para venda no momento.</p>
            ) : null}
            {plans.map((plan) => {
              const link = `${generalLink}?plano=${encodeURIComponent(plan.code)}`;
              return (
                <Card key={plan.id}>
                  <CardHeader>
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription>
                      {formatCents(plan.price_cents)} por {plan.billing_interval === "year" ? "ano" : "mês"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-3">
                    <code className="min-w-0 break-all text-sm">{link}</code>
                    <CopyLinkButton link={link} label={`Copiar link do plano ${plan.name}`} />
                  </CardContent>
                </Card>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
