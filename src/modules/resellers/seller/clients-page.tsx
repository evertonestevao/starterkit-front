import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireSellerPage } from "../areaAccess";
import { StatCards } from "../components/stat-cards";
import { formatCommission, formatDate, formatDuration } from "../format";
import { createSellerRepository } from "../sellerRepository";

export default async function SellerClientsPage() {
  await requireSellerPage();
  const clients = await (await createSellerRepository()).listClients();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Meus clientes</h2>
        <p className="text-sm text-muted-foreground">Quem contratou pelo seu link</p>
      </div>
      <StatCards
        stats={[
          { label: "Clientes ativos", value: String(clients.filter((client) => !client.ended_at).length) },
          { label: "Encerrados", value: String(clients.filter((client) => client.ended_at).length) },
          { label: "Total de vendas", value: String(clients.length) },
        ]}
      />
      {clients.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum cliente ainda. Divulgue seu link em Meu link.</p> : null}
      <ul className="flex flex-col gap-3">
        {clients.map((client) => (
          <li key={client.id}>
            <Card>
              <CardContent className="grid gap-2 text-sm md:grid-cols-[2fr_1fr_1fr_1fr] md:items-center">
                <div className="min-w-0">
                  <p className="font-medium">
                    {client.client_name} {client.ended_at ? <Badge variant="outline">Encerrado</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {client.plan_name ?? "—"} · desde {formatDate(client.started_at)}
                  </p>
                </div>
                <p>
                  <span className="text-muted-foreground">Venda nº </span>
                  {client.sale_number}
                </p>
                <p>
                  <span className="text-muted-foreground">Comissão: </span>
                  {formatCommission(client)}
                </p>
                <p>
                  <span className="text-muted-foreground">Duração: </span>
                  {formatDuration(client.duration_months)}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
