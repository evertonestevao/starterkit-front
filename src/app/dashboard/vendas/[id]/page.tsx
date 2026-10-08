import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, ExternalLink, Package, Wallet } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PedidosLista } from "@/features/vendas/components/pedidos-lista";
import { VendaAcoes } from "@/features/vendas/components/venda-acoes";
import { VendaForm } from "@/features/vendas/components/venda-form";
import { hojeISO } from "@/lib/acompanhamento";
import { caminhoDaIgreja } from "@/lib/churchPaths";
import { isAppError } from "@/lib/errors";
import { SITUACAO_VENDA, resumirPedidos, situacaoDaVenda, unidadesReservadas } from "@/lib/vendas";
import { getChurchProfileService } from "@/server/churchProfile";
import { getVendasActorAutorizado, getVendasService } from "@/server/vendas";
import { formatCents } from "@/services/sponsorPricing";

export const metadata: Metadata = { title: "Venda" };

export default async function VendaPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getVendasActorAutorizado();
  if (!actor) notFound();
  const { id } = await params;

  const detalhe = await (await getVendasService()).detalhe(actor, id).catch((err: unknown) => {
    if (isAppError(err) && err.code === "not_found") return null;
    throw err;
  });
  if (!detalhe) notFound();
  const { venda, pedidos } = detalhe;

  const hoje = hojeISO();
  const situacao = situacaoDaVenda(venda, unidadesReservadas(pedidos), hoje);
  const resumo = resumirPedidos(pedidos);
  // Link para a página pública da venda (a igreja ativa).
  const igreja = (await (await getChurchProfileService()).list(actor.companyId).catch(() => []))[0];
  const linkPublico = igreja ? `${caminhoDaIgreja(igreja.chavePublica)}/vendas/${venda.id}` : null;

  return (
    <>
      <Link href="/dashboard/vendas" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Vendas
      </Link>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight break-words">{venda.titulo}</h2>
          <Badge variant={situacao === "aberta" ? "default" : situacao === "aguardando_pix" ? "outline" : "secondary"}>
            {SITUACAO_VENDA[situacao]}
          </Badge>
        </div>
        <VendaAcoes venda={venda} temPedidos={pedidos.length > 0} />
      </div>

      {situacao === "aguardando_pix" ? (
        <Alert>
          <Clock className="size-4" />
          <AlertDescription>
            A venda ainda não aparece na página. Enviamos ao Responsável da igreja um e-mail para confirmar a chave Pix{" "}
            <strong>{venda.pixChave}</strong> ({venda.pixTitular}). Assim que ele confirmar, ela entra no ar.
          </AlertDescription>
        </Alert>
      ) : situacao === "aberta" && linkPublico ? (
        <a
          href={linkPublico}
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1 text-sm text-primary hover:underline"
        >
          Ver na página da igreja <ExternalLink className="size-3.5" />
        </a>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          icon={Package}
          label="Unidades pedidas"
          value={String(resumo.unidades)}
          hint={venda.estoque !== null ? `de ${venda.estoque} no estoque` : `${resumo.pedidos} pedido(s)`}
        />
        <MetricCard icon={Wallet} label="Pago" value={formatCents(resumo.pagoCents)} />
        <MetricCard icon={Clock} label="A confirmar" value={formatCents(resumo.pendenteCents)} />
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="font-medium">Pedidos</h3>
        {pedidos.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum pedido ainda. Quando alguém comprar pela página, o pedido aparece aqui para você conferir o
            comprovante e marcar como pago.
          </p>
        ) : (
          <PedidosLista pedidos={pedidos} titulo={venda.titulo} />
        )}
      </section>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Editar venda</CardTitle>
        </CardHeader>
        <CardContent>
          <VendaForm key={`${venda.id}:${venda.precoCents}:${venda.pixChave}`} venda={venda} hoje={hoje} />
        </CardContent>
      </Card>
    </>
  );
}
