-- Billing por seat: preço do assento extra além do incluso no plano.
-- "Seats inclusos" continua sendo features->>'max_members' (JSONB); o preço
-- do excedente fica em coluna própria (tipada, consultável, sem mágica).
-- Regra de produto: exceder max_members NÃO bloqueia convite — cobra a mais.
alter table public.plans
  add column extra_seat_price_cents integer not null default 0
  check (extra_seat_price_cents >= 0);

comment on column public.plans.extra_seat_price_cents is
  'Preço mensal em centavos por membro além de features.max_members. 0 = plano não vende seat extra (free).';

-- Valores default do starter (ajuste por produto):
update public.plans set extra_seat_price_cents = 1990 where code = 'pro';
update public.plans set extra_seat_price_cents = 3990 where code = 'enterprise';
-- free permanece 0: sem assinatura não há o que cobrar; o limite vira apenas informativo.
