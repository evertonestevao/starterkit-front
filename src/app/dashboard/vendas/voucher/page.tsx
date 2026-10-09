import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BuscarVoucher } from "@/features/vendas/components/buscar-voucher";
import { EntregaControles } from "@/features/vendas/components/entrega-controles";
import { STATUS_PEDIDO, normalizarCodigoVoucher } from "@/lib/vendas";
import { getVendasActorAutorizado, getVendasService } from "@/server/vendas";
import { formatCents } from "@/services/sponsorPricing";

export const metadata: Metadata = { title: "Buscar voucher" };

/** Retirada pelo código curto do voucher (quando a câmera não leu o QR Code). */
export default async function BuscarVoucherPage({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const actor = await getVendasActorAutorizado();
  if (!actor) notFound();
  const digitado = ((await searchParams).codigo ?? "").slice(0, 20);
  const codigo = normalizarCodigoVoucher(digitado);
  const achados = codigo ? await (await getVendasService()).buscarVoucher(actor, codigo) : [];

  return (
    <>
      <Link href="/dashboard/vendas" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Vendas
      </Link>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Retirada pelo voucher</h2>
        <p className="text-sm text-muted-foreground">
          Digite o código que aparece embaixo do QR Code (ex.: K7P-4QX). Com a câmera do celular, é só apontar para o
          QR Code: abre direto o pedido.
        </p>
        <BuscarVoucher valor={digitado} />
      </div>

      {digitado && !codigo ? (
        <p className="text-sm text-destructive">O código tem 6 letras e números, como K7P-4QX.</p>
      ) : codigo && achados.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum pedido com o código {codigo} nas vendas desta igreja.
        </p>
      ) : null}

      {achados.map(({ pedido, venda }) => (
        <Card key={pedido.id} className="max-w-xl">
          <CardHeader>
            <CardDescription>
              {venda.titulo} · <span className="font-mono font-semibold">{pedido.voucherCodigo}</span>
            </CardDescription>
            <CardTitle className="text-xl">{pedido.nome}</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={pedido.status === "pago" ? "default" : pedido.status === "cancelado" ? "secondary" : "destructive"}>
                {STATUS_PEDIDO[pedido.status]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pedido.status === "pendente" ? (
              <Alert variant="destructive">
                <CircleAlert className="size-4" />
                <AlertDescription>Pagamento não confirmado. Confira o comprovante antes de entregar.</AlertDescription>
              </Alert>
            ) : null}
            <ul className="flex flex-col divide-y rounded-lg border">
              {pedido.itens.map((i) => (
                <li key={i.nome} className="flex items-center justify-between px-3 py-2">
                  <span>{i.nome}</span>
                  <strong className="tabular-nums">{i.quantidade}</strong>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Total {formatCents(pedido.totalCents)} · {pedido.telefone}
            </p>
            {pedido.observacao ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-line">{pedido.observacao}</p>
            ) : null}
            <EntregaControles pedido={pedido} />
          </CardContent>
        </Card>
      ))}
    </>
  );
}
