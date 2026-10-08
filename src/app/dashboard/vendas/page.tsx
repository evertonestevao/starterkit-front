import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, ShoppingBag } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatarData, hojeISO } from "@/lib/acompanhamento";
import { SITUACAO_VENDA, resumirPedidos, situacaoDaVenda, unidadesReservadas, type SituacaoVenda } from "@/lib/vendas";
import { getVendasActorAutorizado, getVendasService } from "@/server/vendas";
import { formatCents } from "@/services/sponsorPricing";

export const metadata: Metadata = { title: "Vendas" };

const VARIANTE: Record<SituacaoVenda, "default" | "secondary" | "outline" | "destructive"> = {
  aguardando_pix: "outline",
  aberta: "default",
  esgotada: "secondary",
  encerrada: "secondary",
};

export default async function VendasPage() {
  const actor = await getVendasActorAutorizado();
  if (!actor) notFound();
  const { vendas, pedidos } = await (await getVendasService()).listar(actor);
  const hoje = hojeISO();

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Vendas</h2>
          <p className="text-sm text-muted-foreground">
            Camiseta, pastel, lanche: pedidos pela página da igreja, pagos no Pix de quem organiza. Não entra no caixa
            da igreja.
          </p>
        </div>
        <Link href="/dashboard/vendas/nova" className={buttonVariants()}>
          <Plus className="size-4" /> Nova venda
        </Link>
      </div>

      {vendas.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Nenhuma venda ainda"
          description="Crie uma venda com o valor e a chave Pix de quem recebe. Depois que o Responsável confirmar a chave, ela aparece na página da igreja."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vendas.map((v) => {
            const dela = pedidos.filter((p) => p.vendaId === v.id);
            const situacao = situacaoDaVenda(v, unidadesReservadas(dela), hoje);
            const resumo = resumirPedidos(dela);
            return (
              <Link key={v.id} href={`/dashboard/vendas/${v.id}`}>
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardContent className="flex flex-col gap-2 pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 font-medium break-words">{v.titulo}</p>
                      <span className="shrink-0 font-semibold tabular-nums">{formatCents(v.precoCents)}</span>
                    </div>
                    <Badge variant={VARIANTE[situacao]} className="w-fit">
                      {SITUACAO_VENDA[situacao]}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {resumo.unidades} unidade{resumo.unidades === 1 ? "" : "s"} em {resumo.pedidos} pedido
                      {resumo.pedidos === 1 ? "" : "s"}
                      {v.estoque !== null ? ` · estoque ${v.estoque}` : ""}
                      {v.encerraEm ? ` · até ${formatarData(v.encerraEm)}` : ""}
                    </p>
                    <p className="text-xs">
                      <span className="font-medium text-primary">{formatCents(resumo.pagoCents)} pago</span>
                      {resumo.pendenteCents > 0 ? (
                        <span className="text-muted-foreground"> · {formatCents(resumo.pendenteCents)} a confirmar</span>
                      ) : null}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
