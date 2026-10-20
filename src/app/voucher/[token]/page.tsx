import type { Metadata } from "next";
import { CircleAlert, CircleCheck, Info, Ticket } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EntregaControles } from "@/features/vendas/components/entrega-controles";
import { qrPngDataUrl } from "@/lib/qr";
import { STATUS_PEDIDO, descreverItens } from "@/lib/vendas";
import { getServerEnv } from "@/config/env";
import { getVendasActorAutorizado, getVendasPublicasService, getVendasService } from "@/server/vendas";
import { formatCents } from "@/services/sponsorPricing";

export const metadata: Metadata = {
  title: "Voucher",
  // O caminho é o próprio voucher.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * O link do QR Code do voucher. Duas pessoas abrem:
 *  - quem comprou: vê o voucher (primeiro nome, itens, código) para mostrar
 *    na retirada;
 *  - quem entrega, logado com o módulo Vendas da igreja da venda: vê o
 *    pedido inteiro e marca como entregue. Abrir não marca nada.
 */
export default async function VoucherPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const voucher = await (await getVendasPublicasService()).voucher(token);

  if (!voucher) {
    return (
      <Alert>
        <Info className="size-4" />
        <AlertDescription>Voucher não encontrado. Confira se o link veio inteiro.</AlertDescription>
      </Alert>
    );
  }

  // Quem entrega: logado, com o módulo, e a venda é da igreja ativa dele (a RLS confere).
  const actor = await getVendasActorAutorizado();
  const doPainel = actor ? await (await getVendasService()).pedidoDoVoucher(actor, token).catch(() => null) : null;

  if (doPainel) {
    const { pedido, venda, entreguePor } = doPainel;
    return (
      <Card>
        <CardHeader>
          <CardDescription>
            {venda.titulo} · voucher <span className="font-mono font-semibold">{pedido.voucherCodigo}</span>
          </CardDescription>
          <CardTitle className="text-2xl">{pedido.nome}</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={pedido.status === "pago" ? "default" : pedido.status === "cancelado" ? "secondary" : "destructive"}>
              {STATUS_PEDIDO[pedido.status]}
            </Badge>
            {pedido.entregueEm ? <Badge variant="outline">Entregue</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {pedido.status === "pendente" ? (
            <Alert variant="destructive">
              <CircleAlert className="size-4" />
              <AlertDescription>Pagamento não confirmado. Confira o comprovante antes de entregar.</AlertDescription>
            </Alert>
          ) : null}
          <ul className="flex flex-col divide-y rounded-lg border text-lg">
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
          <EntregaControles pedido={pedido} entreguePor={entreguePor} />
        </CardContent>
      </Card>
    );
  }

  // Quem comprou (ou qualquer pessoa com o link): o voucher para apresentar.
  // Sempre o endereço oficial (não o cabeçalho da requisição, que quem visita controla).
  const qr = await qrPngDataUrl(`${getServerEnv().APP_URL.replace(/\/+$/, "")}/voucher/${token}`, 512);

  return (
    <Card className="text-center">
      <CardHeader>
        <CardDescription className="flex items-center justify-center gap-1.5">
          <Ticket className="size-4" /> Voucher de retirada · {voucher.churchName}
        </CardDescription>
        <CardTitle className="text-xl">{voucher.titulo}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR Code do voucher" width={512} height={512} className="size-56 rounded-lg bg-white p-2" />
        {voucher.codigo ? (
          <p className="font-mono text-3xl font-bold tracking-widest">{voucher.codigo}</p>
        ) : null}
        <p className="text-lg font-medium">{voucher.primeiroNome}</p>
        <p className="text-sm">{descreverItens(voucher.itens)}</p>
        <p className="text-sm text-muted-foreground">Total {formatCents(voucher.totalCents)}</p>
        {voucher.cancelado ? (
          <Badge variant="secondary">Pedido cancelado</Badge>
        ) : voucher.entregueEm ? (
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <CircleCheck className="size-4 text-primary" /> Já retirado
          </p>
        ) : (
          <Badge variant={voucher.pago ? "default" : "outline"}>
            {voucher.pago ? "Pagamento confirmado" : "Aguardando confirmação do pagamento"}
          </Badge>
        )}
        <p className="text-xs text-muted-foreground">
          Apresente este QR Code (ou o código) na retirada. Para guardar, tire um print desta tela.
        </p>
      </CardContent>
    </Card>
  );
}
