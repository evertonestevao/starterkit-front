-- =====================================================================
-- MÓDULO DE REVENDEDORES (opcional, ligado/desligado pelo super_admin)
-- Supabase / Postgres. Ordem: rodar o arquivo inteiro de uma vez.
--
-- ADAPTE antes de rodar (marcado com "ADAPTE"):
--   1. is_super_admin(): como seu projeto identifica o super_admin
--   2. tabelas existentes: tenants, plans, products (nomes de colunas)
--   3. tipos de id: aqui tudo é uuid
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Funções auxiliares
-- ---------------------------------------------------------------------

-- ADAPTE: ajuste para o seu modelo de roles
create or replace function is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 1. Configuração global (a flag que liga/desliga tudo)
-- ---------------------------------------------------------------------

create table if not exists reseller_settings (
  singleton          boolean primary key default true check (singleton),
  resellers_enabled  boolean not null default false
);
insert into reseller_settings (singleton) values (true) on conflict do nothing;

create or replace function resellers_enabled()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select resellers_enabled from reseller_settings limit 1), false);
$$;

-- ---------------------------------------------------------------------
-- 2. Visibilidade de planos para revendedores
--    Padrão = false: nenhum plano aparece até o super_admin liberar.
-- ---------------------------------------------------------------------

-- ADAPTE: nome da tabela de planos
alter table plans
  add column if not exists available_to_resellers boolean not null default false;

-- ---------------------------------------------------------------------
-- 3. Revendedores
-- ---------------------------------------------------------------------

create table if not exists resellers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references auth.users(id) on delete restrict,
  referral_code  text not null unique,
  status         text not null default 'active' check (status in ('active','suspended')),
  created_at     timestamptz not null default now()
);

create or replace function current_reseller_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select id from resellers
  where user_id = auth.uid() and status = 'active';
$$;

-- ---------------------------------------------------------------------
-- 4. Regras de comissão (padrões)
--    reseller_id nulo  = regra global
--    product_id/plan_id nulos = vale para qualquer produto/plano
--    from_sale_number  = a partir de qual venda (por produto) a regra vale
-- ---------------------------------------------------------------------

create table if not exists commission_rules (
  id                uuid primary key default gen_random_uuid(),
  reseller_id       uuid references resellers(id) on delete cascade,
  product_id        uuid references products(id) on delete cascade,
  plan_id           uuid references plans(id) on delete cascade,
  from_sale_number  int  not null default 1 check (from_sale_number >= 1),
  type              text not null check (type in ('percent','fixed')),
  value             numeric(12,2) not null check (value >= 0),
  duration_months   int check (duration_months is null or duration_months > 0), -- nulo = enquanto estiver pagando
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  check (type <> 'percent' or value <= 100)
);

-- ---------------------------------------------------------------------
-- 5. Vínculo cliente <-> vendedor (guarda o valor JÁ CALCULADO)
--    Editar esta linha muda só os próximos lançamentos.
-- ---------------------------------------------------------------------

create table if not exists reseller_clients (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null unique references tenants(id) on delete cascade,
  reseller_id       uuid not null references resellers(id) on delete restrict,
  product_id        uuid references products(id),
  plan_id           uuid references plans(id),
  sale_number       int  not null,                       -- nº da venda deste vendedor neste produto
  commission_type   text not null check (commission_type in ('percent','fixed')),
  commission_value  numeric(12,2) not null check (commission_value >= 0),
  duration_months   int check (duration_months is null or duration_months > 0),
  is_override       boolean not null default false,      -- true = valor editado manualmente
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,                          -- preenchido ao cancelar
  check (commission_type <> 'percent' or commission_value <= 100)
);
create index if not exists reseller_clients_reseller_idx on reseller_clients(reseller_id);

-- ---------------------------------------------------------------------
-- 6. Lançamentos mensais de comissão (um por pagamento confirmado)
-- ---------------------------------------------------------------------

create table if not exists reseller_commissions (
  id                  uuid primary key default gen_random_uuid(),
  reseller_client_id  uuid not null references reseller_clients(id) on delete cascade,
  reseller_id         uuid not null references resellers(id) on delete restrict,
  stripe_invoice_id   text not null unique,              -- garante idempotência do webhook
  base_amount         numeric(12,2) not null,            -- mensalidade sobre a qual foi calculada
  commission_type     text not null,
  commission_value    numeric(12,2) not null,            -- cópia da regra no momento
  amount              numeric(12,2) not null,            -- editável pelo super_admin
  status              text not null default 'pending' check (status in ('pending','paid','reversed')),
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists reseller_commissions_reseller_idx on reseller_commissions(reseller_id, status);

-- ---------------------------------------------------------------------
-- 7. Histórico de alterações
-- ---------------------------------------------------------------------

create table if not exists reseller_audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   uuid,
  action      text not null,
  changed_by  uuid,
  old_values  jsonb,
  new_values  jsonb,
  changed_at  timestamptz not null default now()
);

create or replace function reseller_audit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into reseller_audit_log (table_name, record_id, action, changed_by, old_values, new_values)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_commission_rules
  after insert or update or delete on commission_rules
  for each row execute function reseller_audit();
create trigger audit_reseller_clients
  after insert or update or delete on reseller_clients
  for each row execute function reseller_audit();
create trigger audit_reseller_commissions
  after update or delete on reseller_commissions
  for each row execute function reseller_audit();

-- ---------------------------------------------------------------------
-- 8. Qual regra vale? (mais específica vence)
--    Ordem: regra do vendedor > global; depois plano > produto > genérica;
--    por fim a maior faixa from_sale_number <= nº da venda.
-- ---------------------------------------------------------------------

create or replace function resolve_commission(
  p_reseller_id uuid, p_product_id uuid, p_plan_id uuid, p_sale_number int
)
returns table (type text, value numeric, duration_months int)
language sql stable security definer set search_path = public as $$
  select r.type, r.value, r.duration_months
  from commission_rules r
  where r.active
    and (r.reseller_id = p_reseller_id or r.reseller_id is null)
    and (r.plan_id    = p_plan_id    or r.plan_id    is null)
    and (r.product_id = p_product_id or r.product_id is null)
    and r.from_sale_number <= p_sale_number
  order by
    (r.reseller_id is not null) desc,
    (r.plan_id     is not null) desc,
    (r.product_id  is not null) desc,
    r.from_sale_number desc
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- 9. Vincular um cliente a um vendedor (fluxo de indicação)
--    Só aceita planos liberados pelo super_admin.
--    Chamar pelo backend (service_role).
-- ---------------------------------------------------------------------

create or replace function link_tenant_to_reseller(
  p_tenant_id uuid, p_reseller_id uuid, p_plan_id uuid
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_product_id uuid;
  v_available  boolean;
  v_sale_no    int;
  v_rule       record;
  v_id         uuid;
begin
  if not resellers_enabled() then
    raise exception 'Módulo de revendedores desativado';
  end if;

  select product_id, available_to_resellers
    into v_product_id, v_available
  from plans where id = p_plan_id;

  if v_available is distinct from true then
    raise exception 'Plano não disponível para revendedores';
  end if;

  select count(*) + 1 into v_sale_no
  from reseller_clients
  where reseller_id = p_reseller_id and product_id = v_product_id;

  select * into v_rule
  from resolve_commission(p_reseller_id, v_product_id, p_plan_id, v_sale_no);

  if v_rule is null then
    raise exception 'Nenhuma regra de comissão aplicável';
  end if;

  insert into reseller_clients (
    tenant_id, reseller_id, product_id, plan_id, sale_number,
    commission_type, commission_value, duration_months
  ) values (
    p_tenant_id, p_reseller_id, v_product_id, p_plan_id, v_sale_no,
    v_rule.type, v_rule.value, v_rule.duration_months
  ) returning id into v_id;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 10. Gerar lançamento quando o pagamento é confirmado (webhook Stripe)
--     invoice.paid -> register_commission(...)
-- ---------------------------------------------------------------------

create or replace function register_commission(
  p_tenant_id uuid, p_stripe_invoice_id text, p_base_amount numeric
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rc        reseller_clients%rowtype;
  v_count   int;
  v_amount  numeric(12,2);
  v_id      uuid;
begin
  -- Com o módulo desligado não gera lançamentos (zero impacto).
  if not resellers_enabled() then return null; end if;

  select * into rc
  from reseller_clients
  where tenant_id = p_tenant_id and ended_at is null;
  if not found then return null; end if;

  -- Duração limitada: para de gerar depois de X lançamentos válidos
  if rc.duration_months is not null then
    select count(*) into v_count
    from reseller_commissions
    where reseller_client_id = rc.id and status <> 'reversed';
    if v_count >= rc.duration_months then return null; end if;
  end if;

  v_amount := case rc.commission_type
    when 'percent' then round(p_base_amount * rc.commission_value / 100, 2)
    else rc.commission_value
  end;

  insert into reseller_commissions (
    reseller_client_id, reseller_id, stripe_invoice_id,
    base_amount, commission_type, commission_value, amount
  ) values (
    rc.id, rc.reseller_id, p_stripe_invoice_id,
    p_base_amount, rc.commission_type, rc.commission_value, v_amount
  )
  on conflict (stripe_invoice_id) do nothing
  returning id into v_id;

  return v_id;
end $$;

-- Reembolso/estorno: reverte só o que ainda não foi pago
create or replace function reverse_commission(p_stripe_invoice_id text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  update reseller_commissions
     set status = 'reversed'
   where stripe_invoice_id = p_stripe_invoice_id and status = 'pending';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

-- Funções de escrita: só o backend (service_role) executa
revoke execute on function link_tenant_to_reseller(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function register_commission(uuid, text, numeric)  from public, anon, authenticated;
revoke execute on function reverse_commission(text)                  from public, anon, authenticated;
grant  execute on function link_tenant_to_reseller(uuid, uuid, uuid) to service_role;
grant  execute on function register_commission(uuid, text, numeric)  to service_role;
grant  execute on function reverse_commission(text)                  to service_role;

-- ---------------------------------------------------------------------
-- 11. RLS nas tabelas: só o super_admin acessa direto.
--     O revendedor lê SOMENTE pelas views da seção 12.
-- ---------------------------------------------------------------------

alter table reseller_settings    enable row level security;
alter table resellers            enable row level security;
alter table commission_rules     enable row level security;
alter table reseller_clients     enable row level security;
alter table reseller_commissions enable row level security;
alter table reseller_audit_log   enable row level security;

create policy settings_read   on reseller_settings for select to authenticated using (true);
create policy settings_admin  on reseller_settings for all    to authenticated
  using (is_super_admin()) with check (is_super_admin());

create policy resellers_admin on resellers for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
create policy resellers_self  on resellers for select to authenticated
  using (user_id = auth.uid());

create policy rules_admin     on commission_rules     for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
create policy rclients_admin  on reseller_clients     for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
create policy rcomm_admin     on reseller_commissions for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
create policy audit_admin     on reseller_audit_log   for select to authenticated
  using (is_super_admin());

-- ---------------------------------------------------------------------
-- 12. Views do revendedor (rodam como dono, então filtram sozinhas)
--     Ele não ganha acesso às tabelas tenants/plans.
-- ---------------------------------------------------------------------

-- Planos que o super_admin liberou (para ele ver o que pode vender)
-- ADAPTE: colunas de plans (name, price...)
create or replace view reseller_available_plans as
select p.id, p.name, p.product_id
from plans p
where p.available_to_resellers
  and resellers_enabled()
  and current_reseller_id() is not null;

-- Para quem vendeu e quanto vai receber por cliente.
-- Planos escondidos depois continuam aparecendo aqui para clientes já vendidos.
-- ADAPTE: tenants.name
create or replace view reseller_my_clients as
select
  rc.id,
  t.name                as client_name,
  pl.name               as plan_name,
  rc.sale_number,
  rc.commission_type,
  rc.commission_value,
  rc.duration_months,
  rc.started_at,
  rc.ended_at
from reseller_clients rc
join tenants t  on t.id  = rc.tenant_id
left join plans pl on pl.id = rc.plan_id
where rc.reseller_id = current_reseller_id()
  and resellers_enabled();

create or replace view reseller_my_commissions as
select
  c.id,
  t.name         as client_name,
  c.base_amount,
  c.commission_type,
  c.commission_value,
  c.amount,
  c.status,
  c.created_at,
  c.paid_at
from reseller_commissions c
join reseller_clients rc on rc.id = c.reseller_client_id
join tenants t           on t.id  = rc.tenant_id
where c.reseller_id = current_reseller_id()
  and resellers_enabled();

grant select on reseller_available_plans, reseller_my_clients, reseller_my_commissions to authenticated;
