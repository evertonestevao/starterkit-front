import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ReceivingForms,
  type ReceivingChurch,
} from "@/features/church/components/receiving-forms";
import { formatCents } from "@/services/sponsorPricing";
import { getChurchReceivingService, getDonationsReader } from "@/server/churchReceiving";
import { getActiveTenant } from "@/server/tenant";
import { canConfigureReceiving } from "@/services/churchReceivingService";

export const metadata: Metadata = { title: "Receber por cartão" };

const SITUACAO: Record<string, string> = {
  pendente: "Aguardando",
  recebida: "Recebida",
  estornada: "Estornada",
  cancelada: "Cancelada",
};

export default async function ReceivingSettingsPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou
  if (!canConfigureReceiving(active.role)) notFound();

  const service = await getChurchReceivingService();
  const [igrejas, contas, doacoes] = await Promise.all([
    service.listChurches(active.id),
    service.list(active.id),
    (await getDonationsReader()).listByCompany(active.id),
  ]);

  const lista: ReceivingChurch[] = igrejas.map((igreja) => ({
    ...igreja,
    conta: contas.find((c) => c.churchId === igreja.id) ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Receber por cartão ou Pix automático (opcional)</CardTitle>
          <CardDescription className="flex flex-col gap-2">
            <span>
              A igreja já pode receber por PIX sem cadastrar nada além da chave. Este passo é só
              para quem quer aceitar cartão (ou Pix confirmado automaticamente) também: a
              plataforma abre uma conta no provedor (Asaas) <strong>em nome da igreja</strong>, e é
              nela que o dinheiro cai. Nada passa pela conta da plataforma, e não há taxa nossa —
              a tarifa é só do provedor, descontada antes do valor cair na conta da igreja.
            </span>
            <span className="text-xs">
              Tarifas padrão do Asaas hoje: cartão de crédito 1,99% + R$ 0,49 por venda nos 3
              primeiros meses de conta, depois 2,99% + R$ 0,49; Pix R$ 0,99 por transação nos 3
              primeiros meses, depois R$ 1,99 (as 100 primeiras transações Pix do mês costumam ser
              isentas). Confira o valor exato válido para a conta da igreja direto no Asaas — o
              contrato pode variar.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReceivingForms igrejas={lista} />
        </CardContent>
      </Card>

      {doacoes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Últimas doações por cartão</CardTitle>
            <CardDescription>
              Valor e situação, como o provedor informou. Quem doou fica com ele: a plataforma não
              guarda nome, e-mail nem documento de quem doa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {doacoes.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span className="tabular-nums">
                    {new Date(d.pagaEm ?? d.createdAt).toLocaleDateString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </span>
                  <span className="text-muted-foreground">{SITUACAO[d.status] ?? d.status}</span>
                  <span className="font-medium tabular-nums">{formatCents(d.amountCents)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
