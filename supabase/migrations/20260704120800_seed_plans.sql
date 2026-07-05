-- Seed do catálogo de planos (plano §9: free, pro, enterprise).
-- Catálogo global é mantido por migration (ver 20260704120500_plans.sql) —
-- os limites/features aqui são os defaults do starter; ajuste por produto.
insert into public.plans (code, name, price_cents, currency, billing_interval, features) values
  (
    'free',
    'Free',
    0,
    'BRL',
    'month',
    '{"max_members": 3, "api_access": false, "reports": false, "audit_retention_days": 7}'
  ),
  (
    'pro',
    'Pro',
    9900,
    'BRL',
    'month',
    '{"max_members": 15, "api_access": true, "reports": true, "audit_retention_days": 90}'
  ),
  (
    'enterprise',
    'Enterprise',
    49900,
    'BRL',
    'month',
    '{"max_members": 999, "api_access": true, "reports": true, "audit_retention_days": 365}'
  )
on conflict (code) do nothing;
