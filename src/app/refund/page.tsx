import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal-page";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Política de Reembolso" };

const sections: LegalSection[] = [
  {
    title: "1. Direito de arrependimento",
    body: "Na primeira contratação de um plano pago, você pode desistir em até 7 dias corridos e receber o valor integral de volta (Código de Defesa do Consumidor, art. 49).",
  },
  {
    title: "2. Cancelamento",
    body: "Você pode cancelar a assinatura a qualquer momento na página de Billing do painel. O acesso ao plano continua até o fim do período já pago, sem novas cobranças.",
  },
  {
    title: "3. Reembolsos após 7 dias",
    body: "Fora do prazo de arrependimento, valores de períodos já iniciados não são reembolsados, salvo falha do serviço ou cobrança indevida.",
  },
  {
    title: "4. Como solicitar",
    body: `Envie um email para ${brand.legal.supportEmail} com o nome da empresa e a data da cobrança. O estorno é feito no mesmo meio de pagamento, no prazo da operadora.`,
  },
];

export default function RefundPage() {
  return <LegalPage title="Política de Reembolso" updatedAt="26/10/2026" sections={sections} />;
}
