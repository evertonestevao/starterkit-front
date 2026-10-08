import type { Metadata } from "next";
import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmarChaveVendaForm } from "@/features/vendas/components/confirmar-chave-venda-form";
import { getConfirmacaoVendaService } from "@/server/vendas";
import { formatCents } from "@/services/sponsorPricing";
import type { ConfirmacaoVendaEstado } from "@/services/vendasService";

export const metadata: Metadata = {
  title: "Confirmar chave Pix da venda",
  // O caminho carrega o token do e-mail.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const SEM_VALIDADE: Record<Exclude<ConfirmacaoVendaEstado, "valido">, string> = {
  usado: "Esta chave já foi confirmada por este link. Não é preciso fazer mais nada.",
  substituido:
    "Este link não vale mais: a chave da venda foi alterada, a venda foi excluída, ou um link mais novo foi enviado. Abra o e-mail mais recente ou peça um novo na tela da venda, em Vendas.",
  expirado: "Este link expirou. Peça um novo na tela da venda, em Vendas, no botão “Reenviar e-mail de confirmação”.",
};

/**
 * Página do link enviado ao Responsável. Abrir NÃO confirma nada (leitores de
 * e-mail abrem links sozinhos): a confirmação é o botão.
 */
export default async function ConfirmarVendaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pedido = await (await getConfirmacaoVendaService()).consultar(token);

  if (!pedido) {
    return (
      <Alert>
        <Info className="size-4" />
        <AlertDescription>
          Link de confirmação inválido. Confira se o endereço veio inteiro do e-mail ou peça um novo na tela da venda.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{pedido.titulo}</CardTitle>
        <CardDescription>
          Venda de {pedido.churchName}, a {formatCents(pedido.precoCents)} cada. Os pagamentos vão para a chave abaixo,
          e a venda só aparece na página da igreja depois da sua confirmação.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pedido.estado === "valido" && pedido.chave ? (
          <ConfirmarChaveVendaForm token={token} chave={pedido.chave} titular={pedido.titular} />
        ) : (
          <Alert>
            <Info className="size-4" />
            <AlertDescription>{SEM_VALIDADE[pedido.estado === "valido" ? "substituido" : pedido.estado]}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
