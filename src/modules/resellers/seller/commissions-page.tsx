import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireSellerPage } from "../areaAccess";
import { StatCards } from "../components/stat-cards";
import { formatCents, formatDate, STATUS_LABEL } from "../format";
import { createSellerRepository } from "../sellerRepository";

export default async function SellerCommissionsPage() {
  await requireSellerPage();
  const commissions = await (await createSellerRepository()).listCommissions();
  const sumBy = (status: string) =>
    commissions.filter((c) => c.status === status).reduce((total, c) => total + c.amount_cents, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Minhas comissões</h2>
        <p className="text-sm text-muted-foreground">Um lançamento por pagamento confirmado do cliente</p>
      </div>
      <StatCards
        stats={[
          { label: "A receber", value: formatCents(sumBy("pending")) },
          { label: "Recebido", value: formatCents(sumBy("paid")) },
          { label: "Lançamentos", value: String(commissions.length) },
        ]}
      />
      {commissions.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma comissão ainda. Elas aparecem aqui quando um cliente seu paga.</p> : null}
      <ul className="flex flex-col gap-3">
        {commissions.map((commission) => (
          <li key={commission.id}>
            <Card>
              <CardContent className="grid gap-2 text-sm md:grid-cols-[2fr_1fr_1fr_1fr] md:items-center">
                <div className="min-w-0">
                  <p className="font-medium">{commission.client_name}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(commission.created_at)}</p>
                </div>
                <p>
                  <span className="text-muted-foreground">Base: </span>
                  {formatCents(commission.base_amount_cents)}
                </p>
                <p>
                  <span className="text-muted-foreground">Comissão: </span>
                  {formatCents(commission.amount_cents)}
                </p>
                <p>
                  <Badge variant={commission.status === "pending" ? "secondary" : "outline"}>
                    {STATUS_LABEL[commission.status]}
                  </Badge>
                  {commission.paid_at ? (
                    <span className="ml-2 text-xs text-muted-foreground">{formatDate(commission.paid_at)}</span>
                  ) : null}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
