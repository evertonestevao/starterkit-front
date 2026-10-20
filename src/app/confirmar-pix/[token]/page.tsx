import type { Metadata } from "next";
import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmarPixForm } from "@/features/church/components/confirmar-pix-form";
import { getChurchPixService } from "@/server/churchPix";
import type { PixConfirmacaoEstado } from "@/services/churchPixService";

export const metadata: Metadata = {
  title: "Confirmar chave PIX",
  // O caminho carrega o token do e-mail.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const SEM_VALIDADE: Record<Exclude<PixConfirmacaoEstado, "valido">, string> = {
  usado: "Esta chave já foi confirmada por este link. Não é preciso fazer mais nada.",
  substituido:
    "Este link não vale mais: a chave foi alterada, ou um link mais novo foi enviado. Abra o e-mail mais recente ou peça um novo em Configurações → Dízimos e ofertas.",
  expirado:
    "Este link expirou. Peça um novo em Configurações → Dízimos e ofertas, no botão “Reenviar e-mail de confirmação”.",
};

/**
 * Página do link enviado ao Responsável da igreja. Abrir NÃO confirma nada
 * (leitores de e-mail abrem links sozinhos): a confirmação é o botão.
 */
export default async function ConfirmarPixPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pedido = await (await getChurchPixService()).consultarConfirmacao(token);

  if (!pedido) {
    return (
      <Alert>
        <Info className="size-4" />
        <AlertDescription>
          Link de confirmação inválido. Confira se o endereço veio inteiro do e-mail ou peça um novo em Configurações →
          Dízimos e ofertas.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chave PIX de {pedido.churchName}</CardTitle>
        <CardDescription>
          É para esta chave que vão os dízimos e ofertas feitos pela página da igreja. Ela só aparece lá depois da sua
          confirmação.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pedido.estado === "valido" && pedido.chave ? (
          <ConfirmarPixForm token={token} chave={pedido.chave} titular={pedido.titular} />
        ) : (
          <Alert>
            <Info className="size-4" />
            <AlertDescription>
              {SEM_VALIDADE[pedido.estado === "valido" ? "substituido" : pedido.estado]}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
