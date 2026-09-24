/**
 * Types do patrocínio. Nada aqui carrega formato de provedor (Asaas, Stripe):
 * os adapters traduzem para estes tipos antes de a regra de negócio ver.
 */

import type { SponsorLinkKind } from "@/lib/sponsorLink";

export type SponsorKind = "person" | "business";

export type SponsorBillingStatus = "none" | "active" | "overdue" | "canceled";

export type SponsorBillingSyncStatus = "synced" | "pending" | "failed";

export type SponsorshipStatus = "pending_payment" | "active" | "cancel_scheduled" | "canceled";

export type SponsorChargeStatus = "pending" | "paid" | "overdue" | "refunded" | "canceled";

export interface SponsorAccount {
  id: string;
  /** Null só em conta de autopatrocínio (dona é a igreja, não uma pessoa). */
  user_id: string | null;
  /** Só em conta de autopatrocínio: a igreja e a empresa dela. */
  church_id: string | null;
  company_id: string | null;
  /** true = a própria igreja se mantendo, sem patrocinador de verdade. */
  is_self_payment: boolean;
  kind: SponsorKind;
  display_name: string;
  email: string;
  phone: string | null;
  document: string;
  logo_url: string | null;
  /** Escolha do próprio patrocinador; não passa por moderação (não é conteúdo). */
  visible_on_page: boolean;
  /** Destino da logo na página pública (site ou WhatsApp). Só a moderação escreve. */
  link_tipo: SponsorLinkKind | null;
  link_valor: string | null;
  gateway: string | null;
  gateway_customer_id: string | null;
  gateway_subscription_id: string | null;
  billing_status: SponsorBillingStatus;
  billed_amount_cents: number | null;
  billing_sync_status: SponsorBillingSyncStatus;
  billing_synced_at: string | null;
  next_due_date: string | null;
  /** Marcada pelo "não fui eu" do email; trava novas alterações de perfil. */
  security_hold_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Pedido de alteração de nome/logo à espera da moderação da plataforma.
 * Enquanto está pendente, a conta segue exibindo o valor antigo.
 */
export type SponsorProfileChangeStatus =
  | "pendente"
  | "aprovada"
  | "recusada"
  | "substituida"
  | "revertida";

export interface SponsorProfileChange {
  id: string;
  novo_display_name: string | null;
  novo_logo_path: string | null;
  anterior_display_name: string;
  anterior_logo_url: string | null;
  /** false = o pedido não mexe no link; true com tipo/valor nulos = remover. */
  novo_link_alterado: boolean;
  novo_link_tipo: SponsorLinkKind | null;
  novo_link_valor: string | null;
  status: SponsorProfileChangeStatus;
  motivo_recusa: string | null;
  created_at: string;
  decided_at: string | null;
}

/** A mesma alteração, do ponto de vista de quem modera. */
export interface PendingProfileChange {
  id: string;
  sponsorAccountId: string;
  sponsorEmail: string;
  novoDisplayName: string | null;
  novoLogoPath: string | null;
  atualDisplayName: string;
  atualLogoUrl: string | null;
  novoLinkAlterado: boolean;
  novoLinkTipo: SponsorLinkKind | null;
  novoLinkValor: string | null;
  atualLinkTipo: SponsorLinkKind | null;
  atualLinkValor: string | null;
  /** Quantas igrejas veriam a mudança se ela for aprovada. */
  igrejas: number;
  createdAt: string;
}

/** O que espera ação da moderação — alimenta os badges do menu. */
export interface PlatformPendingCounts {
  alteracoes: number;
  contasTravadas: number;
  denuncias: number;
}

/** Conta travada pelo "não fui eu", esperando o suporte liberar. */
export interface SecurityHold {
  sponsorAccountId: string;
  displayName: string;
  email: string;
  securityHoldAt: string;
  /** O nome que tentaram publicar e foi desfeito — o contexto da decisão. */
  ultimaTentativaNome: string | null;
  ultimaTentativaEm: string | null;
}

/** Denúncia de uma igreja sobre um patrocinador, na fila da moderação. */
export interface AbuseReport {
  id: string;
  sponsorshipId: string;
  churchName: string;
  sponsorName: string;
  sponsorEmail: string;
  logoUrl: string | null;
  motivo: string;
  createdAt: string;
}

/** Mesmo patrocinador escondido por mais de uma igreja. */
export interface HiddenSignal {
  sponsorAccountId: string;
  sponsorName: string;
  sponsorEmail: string;
  igrejasQueEsconderam: number;
}

export interface Sponsorship {
  id: string;
  sponsor_id: string;
  church_id: string;
  company_id: string;
  status: SponsorshipStatus;
  /** Assinatura inicial do patrocinador: só ela ocupa vaga na igreja. */
  primeiro: boolean;
  activated_at: string | null;
  cancel_requested_at: string | null;
  ends_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Igreja no convite público de patrocínio. */
export interface SponsorshipInviteChurch {
  id: string;
  name: string;
  publicCode: string;
  address: string | null;
  logoUrl: string | null;
}

/**
 * Resultado de uma assinatura iniciada SEM login.
 * - checkout: seguir para o provedor pagar a 1ª fatura;
 * - check_email: o email já tem conta — nada foi cobrado nem vinculado, e um
 *   link de acesso foi enviado (não revelamos que a conta existe);
 * - done: provedor confirmou na hora (dev/fake), já está ativo.
 */
export type PublicSponsorshipResult =
  | { kind: "checkout"; invoiceUrl: string }
  | { kind: "check_email" }
  | { kind: "done" };

/** O que a página pública da igreja mostra de um patrocinador. */
export interface PublicSponsor {
  id: string;
  name: string;
  logo_url: string | null;
  /** Destino da logo (site ou WhatsApp) aprovado pela moderação; null = sem link. */
  link_tipo: SponsorLinkKind | null;
  link_valor: string | null;
}

/** Patrocínio com o nome da igreja, para tela. */
export interface SponsorshipWithChurch extends Sponsorship {
  church_name: string;
  church_public_code: string;
}

export interface SponsorCharge {
  id: string;
  sponsor_id: string;
  gateway: string;
  gateway_payment_id: string;
  amount_cents: number;
  active_count: number;
  due_date: string;
  paid_at: string | null;
  status: SponsorChargeStatus;
  invoice_url: string | null;
  created_at: string;
}

/** Visão de um patrocínio com o valor que ele representa HOJE (calculado). */
export interface SponsorshipView {
  id: string;
  churchId: string;
  churchName: string;
  churchPublicCode: string;
  status: SponsorshipStatus;
  /** Posição no ranking atual; null quando não entra na cobrança. */
  position: number | null;
  /** Valor atribuído pela posição; null quando não entra na cobrança. */
  currentAmountCents: number | null;
  activatedAt: string | null;
  endsAt: string | null;
}

export interface SponsorOverview {
  account: SponsorAccount;
  /** Patrocínios que entram na próxima cobrança (ativos + aguardando 1º pagamento). */
  billableCount: number;
  /** Patrocínios visíveis nas igrejas agora (inclui os com cancelamento agendado). */
  visibleCount: number;
  monthlyTotalCents: number;
  paymentState: "em_dia" | "pendente" | "sem_cobranca";
  /** Última fatura em aberto, para o botão "pagar". */
  openInvoiceUrl: string | null;
  /** Gateway ainda não recebeu o valor recalculado. */
  billingSyncPending: boolean;
}

// ---------------------------------------------------------------------------
// Contrato com o provedor de cobrança recorrente
// ---------------------------------------------------------------------------

export interface BillingCustomerInput {
  name: string;
  email: string;
  document: string;
  phone: string | null;
  /** Nosso id (sponsor_accounts.id), gravado no provedor para rastreio. */
  externalReference: string;
}

export interface CreateRecurringSubscriptionInput {
  customerId: string;
  amountCents: number;
  /** YYYY-MM-DD */
  nextDueDate: string;
  description: string;
  externalReference: string;
  /** Para onde o provedor devolve o pagador depois de pagar, quando suporta. */
  successUrl?: string;
}

export interface BillingChargeSnapshot {
  paymentId: string;
  subscriptionId: string | null;
  amountCents: number;
  /** YYYY-MM-DD */
  dueDate: string;
  status: SponsorChargeStatus;
  paidAt: string | null;
  invoiceUrl: string | null;
}

/** Evento de webhook já traduzido. `ignored` = evento que não nos interessa. */
export type BillingWebhookEvent =
  | { kind: "charge"; provider: string; charge: BillingChargeSnapshot }
  | { kind: "ignored"; provider: string };

export interface CreatedRecurringSubscription {
  subscriptionId: string;
  /** Onde o patrocinador paga a 1ª fatura (e cadastra o cartão). */
  firstInvoiceUrl: string | null;
  /**
   * Eventos que o provedor já produziu de forma síncrona. O fake usa isso para
   * o fluxo inteiro funcionar em dev sem webhook de verdade.
   */
  immediateEvents?: BillingWebhookEvent[];
}
