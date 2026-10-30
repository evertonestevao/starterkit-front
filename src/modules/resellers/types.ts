export type CommissionType = "percent" | "fixed";
export type CommissionStatus = "pending" | "paid" | "reversed";
export type ResellerStatus = "pending" | "active" | "suspended";

export interface AdminReseller {
  id: string;
  name: string;
  email: string;
  referral_code: string;
  status: ResellerStatus;
  has_account: boolean;
  created_at: string;
  active_clients: number;
  pending_cents: number;
  paid_cents: number;
}

export interface CommissionValue {
  commission_type: CommissionType;
  commission_percent: number | null;
  commission_fixed_cents: number | null;
}

export interface AdminClient extends CommissionValue {
  id: string;
  reseller_id: string;
  client_name: string;
  plan_name: string | null;
  sale_number: number;
  duration_months: number | null;
  is_override: boolean;
  started_at: string;
  ended_at: string | null;
}

export interface AdminCommission extends CommissionValue {
  id: string;
  reseller_id: string;
  reseller_name: string;
  client_name: string;
  plan_id: string | null;
  plan_name: string | null;
  base_amount_cents: number;
  months_covered: number;
  amount_cents: number;
  status: CommissionStatus;
  paid_at: string | null;
  refund_flagged_at: string | null;
  created_at: string;
}

export interface CommissionRuleRow extends CommissionValue {
  id: string;
  reseller_id: string | null;
  plan_id: string | null;
  from_sale_number: number;
  duration_months: number | null;
  active: boolean;
}

export interface ResellerPlanRow {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  available_to_resellers: boolean;
}

export interface ResellerAuditEntry {
  id: number;
  table_name: string;
  record_id: string | null;
  action: string;
  changed_by: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_at: string;
}

export interface AdminLinkAlert {
  id: number;
  changed_at: string;
  client_name: string;
  reseller_name: string | null;
  plan_name: string | null;
}

export interface CommissionFailureRow {
  id: string;
  gateway: string;
  event_type: string;
  external_id: string;
  error: string;
  attempts: number;
  created_at: string;
  updated_at: string;
}
