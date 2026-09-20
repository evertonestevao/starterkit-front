/**
 * Types das linhas do banco (espelham supabase/migrations).
 * Fonte única — não redeclarar essas interfaces em outros arquivos.
 */

import type { DomainVerificationChallenge } from "./domain";

export type RoleCode = "owner" | "admin" | "member";

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export type BillingInterval = "month" | "year";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: RoleCode;
  invited_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyInvite {
  id: string;
  company_id: string;
  email: string;
  role: RoleCode;
  invited_by: string;
  token: string;
  status: InviteStatus;
  expires_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  company_id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  currency: string;
  billing_interval: BillingInterval;
  /** Limites e flags do plano, ex.: { max_members: 5, api_access: true } */
  features: Record<string, unknown>;
  /** Preço mensal (centavos) por seat além de features.max_members; 0 = não vende extra. */
  extra_seat_price_cents: number;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  company_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /** IDs do gateway são neutros — nunca colunas stripe_* no schema. */
  external_subscription_id: string | null;
  external_customer_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TermsVersion {
  id: string;
  version: number;
  content: string;
  published_at: string;
  is_current: boolean;
}

export interface TermsAcceptance {
  id: string;
  user_id: string;
  terms_version_id: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

/** Finalidades de consentimento LGPD. Novas finalidades: migration + aqui. */
export type ConsentType = "email_communications";

export interface UserConsent {
  id: string;
  user_id: string;
  consent_type: ConsentType;
  granted: boolean;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export interface Setting {
  id: string;
  company_id: string;
  key: string;
  value: unknown;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Template {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
}

export type ChurchTemplateMode = "inherit" | "custom";

/** Estados do domínio próprio (enum church_domain_status no banco). */
export type ChurchDomainStatus =
  | "nao_configurado"
  | "pendente_dns"
  | "verificando"
  | "ativo"
  | "erro";

/** Nível na árvore Sede > Subsede > Congregação. Só a plataforma altera. */
export type ChurchTipo = "sede" | "subsede" | "congregacao";

export interface Church {
  id: string;
  /** Empresa dona. Null só nas igrejas de demonstração semeadas no core. */
  company_id: string | null;
  parent_id: string | null;
  tipo: ChurchTipo;
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  service_times: Record<string, string> | null;
  social_links: Record<string, string> | null;
  path: string;
  template_mode: ChurchTemplateMode;
  template_id: string | null;
  public_code: string;
  /** Chave PIX da própria igreja (dízimos e ofertas). A plataforma não intermedeia. */
  pix_chave: string | null;
  /** Titular da chave, para quem doa conferir no app do banco. */
  pix_titular: string | null;
  /** Host próprio da igreja, minúsculo e sem protocolo. Null = só o padrão. */
  dominio_customizado: string | null;
  dominio_status: ChurchDomainStatus;
  /** Só histórico comercial: não muda nada no fluxo de DNS. */
  dominio_suporte_pago: boolean;
  dominio_verificacao: DomainVerificationChallenge[] | null;
  dominio_verificado_em: string | null;
  dominio_ultimo_erro: string | null;
  dominio_solicitado_em: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Colunas de `churches` legíveis pelo anon (GRANT por coluna na migration). */
/** Item da programação: culto semanal ou especial. Sem inscrição. */
export interface ChurchScheduleItem {
  id: string;
  church_id: string;
  titulo: string;
  tipo: "semanal" | "especial";
  /** 0 = domingo … 6 = sábado. Só no semanal. */
  dia_semana: number | null;
  /** "2026-10-04". Só no especial. */
  data: string | null;
  /** "19:30:00" (time do Postgres). */
  hora: string;
  descricao: string | null;
  local: string | null;
}

/** Evento publicado pela igreja na página pública. */
export interface ChurchEvent {
  id: string;
  church_id: string;
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string | null;
  /** Null = no endereço da própria igreja. */
  local: string | null;
  /** Zero = gratuito. Pago direto à igreja; a plataforma não cobra. */
  preco_cents: number;
  inscricoes_abertas: boolean;
}

export type PublicChurch = Omit<
  Church,
  | "company_id"
  | "dominio_customizado"
  | "dominio_status"
  | "dominio_suporte_pago"
  | "dominio_verificacao"
  | "dominio_verificado_em"
  | "dominio_ultimo_erro"
  | "dominio_solicitado_em"
  | "deleted_at"
  | "tipo"
>;

export interface PrayerRequest {
  id: string;
  church_id: string;
  /** Empresa dona da igreja, preenchida por trigger (nunca pelo cliente). */
  company_id: string | null;
  name: string | null;
  message: string;
  created_at: string;
}

export interface EventSignup {
  id: string;
  church_id: string;
  /** Empresa dona da igreja, preenchida por trigger (nunca pelo cliente). */
  company_id: string | null;
  event_name: string;
  person_name: string;
  contact: string;
  created_at: string;
}

export interface Visitor {
  id: string;
  church_id: string;
  /** Empresa dona da igreja, preenchida por trigger (nunca pelo cliente). */
  company_id: string | null;
  name: string;
  contact: string;
  created_at: string;
}

