/**
 * Types das linhas do banco (espelham supabase/migrations).
 * Fonte única — não redeclarar essas interfaces em outros arquivos.
 */

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

export interface Setting {
  id: string;
  company_id: string;
  key: string;
  value: unknown;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
