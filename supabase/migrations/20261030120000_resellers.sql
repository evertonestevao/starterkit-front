-- Módulo de revendedores (docs/plano-modulo-revendedores.md). Opcional e desligado por
-- padrão. O revendedor só indica: o gateway cobra o cliente e cada pagamento confirmado
-- gera um lançamento de comissão.
--
-- reseller_settings, resellers, commission_rules e reseller_audit_log não têm company_id
-- de propósito: pertencem à plataforma, não a uma empresa (exceção autorizada, como
-- roles e plans). reseller_clients e reseller_commissions têm company_id.
--
-- Acesso: o super admin usa as tabelas (RLS); o vendedor lê SOMENTE pelas views; as
-- funções de escrita automática rodam só no backend (service_role).

-- ---------------------------------------------------------------------------
-- Configuração global. resellers_enabled controla só as NOVAS vendas.
-- ---------------------------------------------------------------------------
create table public.reseller_settings (
  singleton boolean primary key default true check (singleton),
  resellers_enabled boolean not null default false,
  reseller_self_signup boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.reseller_settings (singleton) values (true);

create trigger set_reseller_settings_updated_at
  before update on public.reseller_settings
  for each row
  execute function public.set_updated_at();

create or replace function public.resellers_enabled()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select s.resellers_enabled from public.reseller_settings s), false);
$$;

-- Desligado por padrão: nenhum plano aparece até o super admin liberar.
alter table public.plans
  add column available_to_resellers boolean not null default false;

-- ---------------------------------------------------------------------------
-- Vendedores. user_id vira NULL se a conta for excluída: os lançamentos ficam.
-- name/email ficam aqui porque são o elo com o hub futuro (plano §11).
-- ---------------------------------------------------------------------------
create table public.resellers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null,
  email text not null,
  referral_code text not null,
  status text not null default 'active'
    check (status in ('pending', 'active', 'suspended')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resellers_referral_code_format check (referral_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create unique index resellers_referral_code_idx on public.resellers (referral_code);
create unique index resellers_email_active_idx on public.resellers (lower(email)) where deleted_at is null;

create trigger set_resellers_updated_at
  before update on public.resellers
  for each row
  execute function public.set_updated_at();

-- Só vendedor ativo tem painel: suspenso ou pendente recebe NULL.
create or replace function public.current_reseller_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select r.id
  from public.resellers r
  where r.user_id = auth.uid()
    and r.status = 'active'
    and r.deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Regras de comissão. reseller_id NULL = global; plan_id NULL = qualquer plano.
-- Valor: percentual OU centavos fixos, conforme commission_type.
-- ---------------------------------------------------------------------------
create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid references public.resellers (id) on delete restrict,
  plan_id uuid references public.plans (id) on delete restrict,
  from_sale_number integer not null default 1 check (from_sale_number >= 1),
  commission_type text not null check (commission_type in ('percent', 'fixed')),
  commission_percent numeric(5, 2) check (commission_percent between 0 and 100),
  commission_fixed_cents integer check (commission_fixed_cents >= 0),
  duration_months integer check (duration_months > 0), -- NULL = enquanto estiver pagando
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_rules_value check (
    (commission_type = 'percent' and commission_percent is not null and commission_fixed_cents is null)
    or (commission_type = 'fixed' and commission_fixed_cents is not null and commission_percent is null)
  )
);

-- Uma regra ativa por escopo e faixa: resolve_commission nunca empata.
create unique index commission_rules_scope_idx
  on public.commission_rules (
    coalesce(reseller_id, '00000000-0000-0000-0000-000000000000'),
    coalesce(plan_id, '00000000-0000-0000-0000-000000000000'),
    from_sale_number
  )
  where active and deleted_at is null;

create trigger set_commission_rules_updated_at
  before update on public.commission_rules
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Vínculo cliente-vendedor. Guarda a regra JÁ CALCULADA: editar esta linha muda só
-- os próximos lançamentos. Uma empresa só tem um vendedor (vale o primeiro).
-- ---------------------------------------------------------------------------
create table public.reseller_clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete restrict,
  reseller_id uuid not null references public.resellers (id) on delete restrict,
  plan_id uuid references public.plans (id) on delete restrict,
  sale_number integer not null check (sale_number >= 1),
  commission_type text not null check (commission_type in ('percent', 'fixed')),
  commission_percent numeric(5, 2) check (commission_percent between 0 and 100),
  commission_fixed_cents integer check (commission_fixed_cents >= 0),
  duration_months integer check (duration_months > 0),
  is_override boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reseller_clients_sale_number_unique unique (reseller_id, sale_number),
  constraint reseller_clients_value check (
    (commission_type = 'percent' and commission_percent is not null and commission_fixed_cents is null)
    or (commission_type = 'fixed' and commission_fixed_cents is not null and commission_percent is null)
  )
);

create trigger set_reseller_clients_updated_at
  before update on public.reseller_clients
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Lançamentos: um por pagamento confirmado. O par gateway + external_payment_id
-- garante que webhook repetido não duplica.
-- ---------------------------------------------------------------------------
create table public.reseller_commissions (
  id uuid primary key default gen_random_uuid(),
  reseller_client_id uuid not null references public.reseller_clients (id) on delete restrict,
  reseller_id uuid not null references public.resellers (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  gateway text not null,
  external_payment_id text not null,
  base_amount_cents integer not null check (base_amount_cents > 0),
  months_covered integer not null default 1 check (months_covered >= 1),
  commission_type text not null check (commission_type in ('percent', 'fixed')),
  commission_percent numeric(5, 2),
  commission_fixed_cents integer,
  amount_cents integer not null check (amount_cents >= 0), -- editável pelo super admin
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'reversed')),
  paid_at timestamptz,
  refund_flagged_at timestamptz, -- estorno de lançamento já pago: só sinaliza no painel
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reseller_commissions_payment_unique unique (gateway, external_payment_id)
);

create index reseller_commissions_reseller_idx on public.reseller_commissions (reseller_id, status);
create index reseller_commissions_client_idx on public.reseller_commissions (reseller_client_id);

create trigger set_reseller_commissions_updated_at
  before update on public.reseller_commissions
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Histórico: quem, quando, de quanto para quanto. auth.uid() é NULL em escrita do
-- backend (service_role); o painel do super admin escreve com a sessão dele.
-- ---------------------------------------------------------------------------
create table public.reseller_audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action text not null,
  changed_by uuid,
  old_values jsonb,
  new_values jsonb,
  changed_at timestamptz not null default now()
);

create index reseller_audit_log_record_idx on public.reseller_audit_log (table_name, record_id, changed_at desc);

create or replace function public.reseller_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  insert into public.reseller_audit_log (table_name, record_id, action, changed_by, old_values, new_values)
  values (
    tg_table_name,
    (coalesce(v_new, v_old) ->> 'id')::uuid,
    tg_op,
    auth.uid(),
    v_old,
    v_new
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_reseller_settings
  after update on public.reseller_settings
  for each row execute function public.reseller_audit();
create trigger audit_resellers
  after insert or update or delete on public.resellers
  for each row execute function public.reseller_audit();
create trigger audit_commission_rules
  after insert or update or delete on public.commission_rules
  for each row execute function public.reseller_audit();
create trigger audit_reseller_clients
  after insert or update or delete on public.reseller_clients
  for each row execute function public.reseller_audit();
-- O INSERT de lançamento é automático e fica na própria linha; só mudanças vão ao log.
create trigger audit_reseller_commissions
  after update or delete on public.reseller_commissions
  for each row execute function public.reseller_audit();
create trigger audit_plans_available_to_resellers
  after update of available_to_resellers on public.plans
  for each row
  when (old.available_to_resellers is distinct from new.available_to_resellers)
  execute function public.reseller_audit();

-- ---------------------------------------------------------------------------
-- Qual regra vale: vendedor antes de global; plano antes de genérica; maior faixa.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_commission(
  p_reseller_id uuid,
  p_plan_id uuid,
  p_sale_number integer
)
returns setof public.commission_rules
language sql
security definer
set search_path = public
stable
as $$
  select r.*
  from public.commission_rules r
  where r.active
    and r.deleted_at is null
    and (r.reseller_id = p_reseller_id or r.reseller_id is null)
    and (r.plan_id = p_plan_id or r.plan_id is null)
    and r.from_sale_number <= p_sale_number
  order by
    (r.reseller_id is not null) desc,
    (r.plan_id is not null) desc,
    r.from_sale_number desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Vincula uma empresa ao vendedor no primeiro pagamento confirmado. Único ponto, com
-- o link, que depende de resellers_enabled. Recusa devolve NULL em vez de erro: isto
-- roda dentro do webhook e nunca pode derrubar o pagamento.
-- ---------------------------------------------------------------------------
create or replace function public.link_company_to_reseller(
  p_company_id uuid,
  p_reseller_id uuid,
  p_plan_id uuid,
  p_external_subscription_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_sale_number integer;
  v_rule public.commission_rules;
  v_id uuid;
begin
  -- Vale o primeiro vendedor.
  select rc.id into v_existing
  from public.reseller_clients rc
  where rc.company_id = p_company_id;
  if found then
    return v_existing;
  end if;

  if not public.resellers_enabled() then
    return null;
  end if;

  if not exists (
    select 1 from public.resellers r
    where r.id = p_reseller_id and r.status = 'active' and r.deleted_at is null
  ) then
    return null;
  end if;

  if not exists (
    select 1 from public.plans p
    where p.id = p_plan_id and p.available_to_resellers and p.deleted_at is null
  ) then
    return null;
  end if;

  -- Auto-indicação: o vendedor é membro da empresa que está comprando.
  if exists (
    select 1
    from public.company_members cm
    join public.resellers r on r.user_id = cm.user_id
    where cm.company_id = p_company_id and r.id = p_reseller_id
  ) then
    return null;
  end if;

  -- Quem já pagou antes (inclusive assinatura arquivada) não é venda nova.
  if exists (
    select 1 from public.subscriptions s
    where s.company_id = p_company_id
      and s.external_subscription_id is not null
      and s.external_subscription_id is distinct from p_external_subscription_id
  ) then
    return null;
  end if;

  -- Serializa por vendedor: duas vendas simultâneas não pegam o mesmo número.
  perform pg_advisory_xact_lock(hashtextextended(p_reseller_id::text, 0));

  select coalesce(max(rc.sale_number), 0) + 1 into v_sale_number
  from public.reseller_clients rc
  where rc.reseller_id = p_reseller_id;

  select * into v_rule
  from public.resolve_commission(p_reseller_id, p_plan_id, v_sale_number);

  if not found then
    -- Sem regra: não vincula e deixa o alerta para o super admin.
    insert into public.reseller_audit_log (table_name, record_id, action, new_values)
    values ('reseller_clients', p_company_id, 'LINK_NO_RULE',
      jsonb_build_object('reseller_id', p_reseller_id, 'plan_id', p_plan_id, 'sale_number', v_sale_number));
    return null;
  end if;

  insert into public.reseller_clients (
    company_id, reseller_id, plan_id, sale_number, commission_type,
    commission_percent, commission_fixed_cents, duration_months
  ) values (
    p_company_id, p_reseller_id, p_plan_id, v_sale_number, v_rule.commission_type,
    v_rule.commission_percent, v_rule.commission_fixed_cents, v_rule.duration_months
  )
  on conflict (company_id) do nothing
  returning id into v_id;

  if v_id is null then
    select rc.id into v_id from public.reseller_clients rc where rc.company_id = p_company_id;
  end if;
  return v_id;
end;
$$;

-- Assinatura cancelada: encerra o vínculo (reabre se o cliente voltar em até 90 dias).
create or replace function public.end_reseller_client(p_company_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.reseller_clients
  set ended_at = now()
  where company_id = p_company_id and ended_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Gera o lançamento de um pagamento confirmado. NÃO depende de resellers_enabled:
-- quem já vendeu continua recebendo com o módulo desligado.
-- Devolve NULL quando não há lançamento (sem vínculo, duração esgotada, repetido).
-- ---------------------------------------------------------------------------
create or replace function public.register_commission(
  p_company_id uuid,
  p_gateway text,
  p_external_payment_id text,
  p_base_amount_cents integer,
  p_months_covered integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.reseller_clients;
  v_months_used integer;
  v_amount integer;
  v_id uuid;
begin
  if p_base_amount_cents is null or p_base_amount_cents <= 0 then
    return null;
  end if;

  select * into v_client
  from public.reseller_clients rc
  where rc.company_id = p_company_id and rc.deleted_at is null
  for update;
  if not found then
    return null;
  end if;

  if v_client.ended_at is not null then
    if v_client.ended_at < now() - interval '90 days' then
      return null;
    end if;
    update public.reseller_clients set ended_at = null where id = v_client.id;
  end if;

  if v_client.duration_months is not null then
    select coalesce(sum(c.months_covered), 0) into v_months_used
    from public.reseller_commissions c
    where c.reseller_client_id = v_client.id
      and c.status <> 'reversed'
      and c.deleted_at is null;
    if v_months_used >= v_client.duration_months then
      return null;
    end if;
  end if;

  v_amount := case v_client.commission_type
    when 'percent' then round(p_base_amount_cents * v_client.commission_percent / 100)
    else v_client.commission_fixed_cents * p_months_covered
  end;

  insert into public.reseller_commissions (
    reseller_client_id, reseller_id, company_id, gateway, external_payment_id,
    base_amount_cents, months_covered, commission_type, commission_percent,
    commission_fixed_cents, amount_cents
  ) values (
    v_client.id, v_client.reseller_id, p_company_id, p_gateway, p_external_payment_id,
    p_base_amount_cents, p_months_covered, v_client.commission_type,
    v_client.commission_percent, v_client.commission_fixed_cents, v_amount
  )
  on conflict (gateway, external_payment_id) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Estorno. p_refunded_cents é o total estornado até agora; NULL = estorno integral.
-- Pendente: reverte ou recalcula em proporção. Já pago: não mexe, só sinaliza.
-- Devolve true se o valor do lançamento mudou.
-- ---------------------------------------------------------------------------
create or replace function public.reverse_commission(
  p_gateway text,
  p_external_payment_id text,
  p_refunded_cents integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commission public.reseller_commissions;
  v_refunded integer;
begin
  select * into v_commission
  from public.reseller_commissions c
  where c.gateway = p_gateway and c.external_payment_id = p_external_payment_id
  for update;
  if not found or v_commission.status = 'reversed' then
    return false;
  end if;

  if v_commission.status = 'paid' then
    update public.reseller_commissions
    set refund_flagged_at = coalesce(refund_flagged_at, now())
    where id = v_commission.id;
    return false;
  end if;

  v_refunded := least(coalesce(p_refunded_cents, v_commission.base_amount_cents), v_commission.base_amount_cents);
  if v_refunded <= v_commission.refunded_cents then
    return false; -- evento repetido
  end if;

  if v_refunded = v_commission.base_amount_cents then
    update public.reseller_commissions
    set status = 'reversed', refunded_cents = v_refunded
    where id = v_commission.id;
  else
    -- Proporção sobre o saldo: preserva edição manual do valor.
    update public.reseller_commissions
    set refunded_cents = v_refunded,
        amount_cents = round(
          amount_cents::numeric * (base_amount_cents - v_refunded)
          / (base_amount_cents - refunded_cents)
        )
    where id = v_commission.id;
  end if;
  return true;
end;
$$;

-- Liberar plano passa por aqui: não abre escrita em plans para o client.
create or replace function public.set_plan_available_to_resellers(p_plan_id uuid, p_available boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'apenas o super admin libera planos' using errcode = '42501';
  end if;
  update public.plans set available_to_resellers = p_available where id = p_plan_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Views do vendedor. Rodam como dono (sem acesso às tabelas internas) e filtram por
-- current_reseller_id(). Só reseller_available_plans depende de resellers_enabled.
-- ---------------------------------------------------------------------------
create view public.reseller_me with (security_barrier = true) as
select r.id, r.name, r.email, r.referral_code, r.status
from public.resellers r
where r.id = public.current_reseller_id();

create view public.reseller_available_plans with (security_barrier = true) as
select p.id, p.code, p.name, p.price_cents, p.currency, p.billing_interval
from public.plans p
where p.available_to_resellers
  and p.is_active
  and p.deleted_at is null
  and public.resellers_enabled()
  and public.current_reseller_id() is not null;

create view public.reseller_my_clients with (security_barrier = true) as
select
  rc.id,
  c.name as client_name,
  p.name as plan_name,
  rc.sale_number,
  rc.commission_type,
  rc.commission_percent,
  rc.commission_fixed_cents,
  rc.duration_months,
  rc.started_at,
  rc.ended_at
from public.reseller_clients rc
join public.companies c on c.id = rc.company_id
left join public.plans p on p.id = rc.plan_id
where rc.reseller_id = public.current_reseller_id()
  and rc.deleted_at is null;

create view public.reseller_my_commissions with (security_barrier = true) as
select
  rm.id,
  c.name as client_name,
  rm.base_amount_cents,
  rm.months_covered,
  rm.commission_type,
  rm.commission_percent,
  rm.commission_fixed_cents,
  rm.amount_cents,
  rm.status,
  rm.created_at,
  rm.paid_at
from public.reseller_commissions rm
join public.companies c on c.id = rm.company_id
where rm.reseller_id = public.current_reseller_id()
  and rm.deleted_at is null;

-- ---------------------------------------------------------------------------
-- RLS: nas tabelas, só o super admin. O vendedor não tem policy nenhuma aqui.
-- ---------------------------------------------------------------------------
alter table public.reseller_settings enable row level security;
alter table public.resellers enable row level security;
alter table public.commission_rules enable row level security;
alter table public.reseller_clients enable row level security;
alter table public.reseller_commissions enable row level security;
alter table public.reseller_audit_log enable row level security;

create policy "reseller_settings_super_admin" on public.reseller_settings
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "resellers_super_admin" on public.resellers
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "commission_rules_super_admin" on public.commission_rules
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "reseller_clients_super_admin" on public.reseller_clients
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "reseller_commissions_super_admin" on public.reseller_commissions
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "reseller_audit_log_super_admin" on public.reseller_audit_log
  for select to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- GRANTs. Nada para anon. Sem DELETE: remoção é soft delete. Vínculo e lançamento
-- nascem só pelas funções do backend, por isso sem INSERT.
-- ---------------------------------------------------------------------------
grant select, update on public.reseller_settings to authenticated;
grant select, insert, update on public.resellers to authenticated;
grant select, insert, update on public.commission_rules to authenticated;
grant select, update on public.reseller_clients to authenticated;
grant select, update on public.reseller_commissions to authenticated;
grant select on public.reseller_audit_log to authenticated;

grant select on
  public.reseller_me,
  public.reseller_available_plans,
  public.reseller_my_clients,
  public.reseller_my_commissions
to authenticated;

grant execute on function public.set_plan_available_to_resellers(uuid, boolean) to authenticated;

-- Função chamada dentro de view usa o privilégio de quem consulta, não o do dono.
grant execute on function
  public.resellers_enabled(),
  public.current_reseller_id()
to authenticated, service_role;

grant execute on function
  public.resolve_commission(uuid, uuid, integer),
  public.link_company_to_reseller(uuid, uuid, uuid, text),
  public.end_reseller_client(uuid),
  public.register_commission(uuid, text, text, integer, integer),
  public.reverse_commission(text, text, integer)
to service_role;
