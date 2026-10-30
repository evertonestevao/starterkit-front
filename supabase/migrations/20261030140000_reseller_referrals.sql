-- Link de afiliado (plano §5): guarda qual código trouxe cada empresa. O vínculo com
-- comissão continua nascendo só na contratação (link_company_to_reseller).
-- Tabela própria, não coluna em companies: admin da empresa tem UPDATE lá e poderia
-- trocar o próprio vendedor.
create table public.reseller_referrals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete restrict,
  reseller_id uuid not null references public.resellers (id) on delete restrict,
  referral_code text not null,
  referred_by_user_id uuid references auth.users (id) on delete set null,
  captured_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index reseller_referrals_reseller_idx on public.reseller_referrals (reseller_id);

alter table public.reseller_referrals enable row level security;

grant select on public.reseller_referrals to authenticated;

-- Só o super admin lê; a gravação é do backend, por record_company_referral.
create policy "reseller_referrals_super_admin" on public.reseller_referrals
  for select to authenticated
  using (public.is_super_admin());

create trigger audit_reseller_referrals
  after insert or update or delete on public.reseller_referrals
  for each row execute function public.reseller_audit();

-- Usada a cada clique (com cache na aplicação): consulta só por índice único.
create or replace function public.is_valid_referral_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.resellers_enabled() and exists (
    select 1 from public.resellers r
    where r.referral_code = p_code and r.status = 'active' and r.deleted_at is null
  );
$$;

-- Auto-indicação: mesmo usuário ou mesmo e-mail, de quem cadastra ou de membro da empresa.
create or replace function public.is_self_referral(
  p_company_id uuid,
  p_reseller_id uuid,
  p_user_id uuid default null
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.resellers r
    join auth.users u on u.id = p_user_id
      or u.id in (
        select cm.user_id from public.company_members cm where cm.company_id = p_company_id
      )
    where r.id = p_reseller_id
      and (u.id = r.user_id or lower(u.email) = lower(r.email))
  );
$$;

-- Grava a atribuição. Recusa devolve NULL: nunca atrapalha a criação da empresa.
create or replace function public.record_company_referral(
  p_company_id uuid,
  p_referral_code text,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reseller_id uuid;
  v_id uuid;
begin
  if not public.is_valid_referral_code(p_referral_code) then
    return null;
  end if;

  select r.id into v_reseller_id
  from public.resellers r
  where r.referral_code = p_referral_code;

  if public.is_self_referral(p_company_id, v_reseller_id, p_user_id) then
    return null;
  end if;

  -- Vale o primeiro vendedor.
  insert into public.reseller_referrals (company_id, reseller_id, referral_code, referred_by_user_id)
  values (p_company_id, v_reseller_id, p_referral_code, p_user_id)
  on conflict (company_id) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- Mesma função da Fase 1; só a checagem de auto-indicação passa a incluir o e-mail.
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

  if public.is_self_referral(p_company_id, p_reseller_id) then
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

grant execute on function
  public.is_valid_referral_code(text),
  public.is_self_referral(uuid, uuid, uuid),
  public.record_company_referral(uuid, text, uuid)
to service_role;
