import { Badge } from "@/components/ui/badge";
import type { SponsorChargeStatus, SponsorshipStatus } from "@/types/sponsorship";

type Variant = "default" | "secondary" | "outline" | "destructive";

const SPONSORSHIP: Record<SponsorshipStatus, { label: string; variant: Variant }> = {
  active: { label: "Ativo", variant: "default" },
  pending_payment: { label: "Aguardando pagamento", variant: "secondary" },
  cancel_scheduled: { label: "Cancelamento agendado", variant: "outline" },
  canceled: { label: "Encerrado", variant: "outline" },
};

const CHARGE: Record<SponsorChargeStatus, { label: string; variant: Variant }> = {
  pending: { label: "Em aberto", variant: "secondary" },
  paid: { label: "Pago", variant: "default" },
  overdue: { label: "Atrasado", variant: "destructive" },
  refunded: { label: "Estornado", variant: "outline" },
  canceled: { label: "Cancelado", variant: "outline" },
};

export function SponsorshipStatusBadge({ status }: { status: SponsorshipStatus }) {
  const { label, variant } = SPONSORSHIP[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function ChargeStatusBadge({ status }: { status: SponsorChargeStatus }) {
  const { label, variant } = CHARGE[status];
  return <Badge variant={variant}>{label}</Badge>;
}

/** "17/10/2026" para datas YYYY-MM-DD, sem deslocar o dia pelo fuso. */
export function formatDueDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
