import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal-page";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Política de Privacidade" };

const { legal } = brand;

const sections: LegalSection[] = [
  {
    title: "1. Quem é o controlador",
    body: `${legal.companyName}, CNPJ ${legal.cnpj}, ${legal.address}.`,
  },
  {
    title: "2. Dados que coletamos",
    body: "Cadastro: nome completo, email e senha (armazenada apenas como hash).\nUso da plataforma: empresas e membros que você cadastra, registros de auditoria das ações, endereço IP e navegador no aceite dos termos.\nPagamento: processado pelo gateway; não armazenamos dados de cartão.",
  },
  {
    title: "3. Finalidades e bases legais (LGPD, art. 7º)",
    body: "Execução de contrato: criar e manter sua conta e as empresas.\nCumprimento de obrigação legal: registros fiscais e de acesso (Marco Civil da Internet, art. 15).\nLegítimo interesse: segurança, prevenção a fraude e auditoria.\nConsentimento: comunicações por email, revogável a qualquer momento.",
  },
  {
    title: "4. Compartilhamento e suboperadores",
    body: "Supabase (banco de dados, autenticação e arquivos), o processador de pagamentos (Asaas ou Stripe, conforme a contratação) e Resend (envio de emails). Alguns desses serviços podem processar dados fora do Brasil, com as salvaguardas do art. 33 da LGPD.",
  },
  {
    title: "5. Cookies",
    body: "Usamos apenas cookies essenciais para manter sua sessão autenticada. Não usamos cookies de análise ou publicidade.",
  },
  {
    title: "6. Retenção",
    body: "Mantemos os dados enquanto a conta estiver ativa e pelo prazo exigido por lei após o encerramento. Registros de auditoria seguem a retenção do plano contratado.",
  },
  {
    title: "7. Seus direitos (LGPD, art. 18)",
    body: `Confirmação, acesso, correção, portabilidade, eliminação, informação sobre compartilhamento e revogação do consentimento. Solicite pelo email do encarregado: ${legal.dpoEmail}.`,
  },
];

export default function PrivacyPage() {
  return <LegalPage title="Política de Privacidade" updatedAt="26/10/2026" sections={sections} />;
}
