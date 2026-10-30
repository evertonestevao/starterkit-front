-- Nº da venda só existe a partir do primeiro pagamento confirmado: checkout abandonado não
-- consome número nem antecipa faixa. O vínculo nasce no checkout, sem número e com a regra
-- provisória; no primeiro pagamento, número e regra são definidos (ajuste manual é mantido).
alter table public.reseller_clients alter column sale_number drop not null;

update public.reseller_clients rc
set sale_number = null
where not exists (select 1 from public.reseller_commissions c where c.reseller_client_id = rc.id);

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
  v_next_sale integer;
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

  select coalesce(max(rc.sale_number), 0) + 1 into v_next_sale
  from public.reseller_clients rc
  where rc.reseller_id = p_reseller_id;

  select * into v_rule
  from public.resolve_commission(p_reseller_id, p_plan_id, v_next_sale);

  if not found then
    -- Sem regra: não vincula e deixa o alerta para o super admin.
    insert into public.reseller_audit_log (table_name, record_id, action, new_values)
    values ('reseller_clients', p_company_id, 'LINK_NO_RULE',
      jsonb_build_object('reseller_id', p_reseller_id, 'plan_id', p_plan_id, 'sale_number', v_next_sale));
    return null;
  end if;

  insert into public.reseller_clients (
    company_id, reseller_id, plan_id, sale_number, commission_type,
    commission_percent, commission_fixed_cents, duration_months
  ) values (
    p_company_id, p_reseller_id, p_plan_id, null, v_rule.commission_type,
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
  v_return_window_days integer;
  v_rule public.commission_rules;
  v_months_used integer;
  v_months_payable integer := p_months_covered;
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
    select s.client_return_window_days into v_return_window_days from public.reseller_settings s;
    if v_client.ended_at < now() - make_interval(days => v_return_window_days) then
      return null;
    end if;
    update public.reseller_clients set ended_at = null where id = v_client.id;
  end if;

  -- Primeiro pagamento: é aqui que o cliente vira venda e a faixa é definida.
  if v_client.sale_number is null then
    -- Serializa por vendedor: dois pagamentos simultâneos não pegam o mesmo número.
    perform pg_advisory_xact_lock(hashtextextended(v_client.reseller_id::text, 0));

    select coalesce(max(rc.sale_number), 0) + 1 into v_client.sale_number
    from public.reseller_clients rc
    where rc.reseller_id = v_client.reseller_id;

    if not v_client.is_override then
      select * into v_rule
      from public.resolve_commission(v_client.reseller_id, v_client.plan_id, v_client.sale_number);
      -- Regra removida depois do checkout: fica a provisória, para o pagamento não se perder.
      if found then
        v_client.commission_type := v_rule.commission_type;
        v_client.commission_percent := v_rule.commission_percent;
        v_client.commission_fixed_cents := v_rule.commission_fixed_cents;
        v_client.duration_months := v_rule.duration_months;
      end if;
    end if;

    update public.reseller_clients
    set sale_number = v_client.sale_number,
        commission_type = v_client.commission_type,
        commission_percent = v_client.commission_percent,
        commission_fixed_cents = v_client.commission_fixed_cents,
        duration_months = v_client.duration_months
    where id = v_client.id;
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
    v_months_payable := least(p_months_covered, v_client.duration_months - v_months_used);
  end if;

  v_amount := case v_client.commission_type
    when 'percent' then round(
      p_base_amount_cents * v_client.commission_percent / 100 * v_months_payable / p_months_covered
    )
    else v_client.commission_fixed_cents * v_months_payable
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

-- Vendedor só vê quem já pagou: checkout abandonado não é cliente dele.
create or replace view public.reseller_my_clients with (security_barrier = true) as
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
  and rc.deleted_at is null
  and rc.sale_number is not null;

create or replace view public.reseller_admin_totals with (security_barrier = true) as
select
  r.id,
  r.name,
  r.email,
  r.referral_code,
  r.status,
  r.user_id is not null as has_account,
  r.created_at,
  (select count(*) from public.reseller_clients rc
    where rc.reseller_id = r.id and rc.ended_at is null and rc.deleted_at is null
      and rc.sale_number is not null) as active_clients,
  (select coalesce(sum(c.amount_cents), 0) from public.reseller_commissions c
    where c.reseller_id = r.id and c.status = 'pending' and c.deleted_at is null) as pending_cents,
  (select coalesce(sum(c.amount_cents), 0) from public.reseller_commissions c
    where c.reseller_id = r.id and c.status = 'paid' and c.deleted_at is null) as paid_cents
from public.resellers r
where r.deleted_at is null
  and public.is_super_admin();

-- "Vincular agora" no alerta LINK_NO_RULE. Sem retroativo: o que já foi pago não gera
-- lançamento, e o primeiro pagamento seguinte define nº da venda e faixa. A assinatura
-- atual é informada para não contar como "já pagou antes": ela é a própria venda do alerta.
create or replace function public.link_company_from_alert(p_alert_id bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alert public.reseller_audit_log;
  v_external text;
begin
  if not public.is_super_admin() then
    raise exception 'apenas o super admin vincula clientes' using errcode = '42501';
  end if;

  select * into v_alert
  from public.reseller_audit_log a
  where a.id = p_alert_id and a.action = 'LINK_NO_RULE';
  if not found then
    return null;
  end if;

  select s.external_subscription_id into v_external
  from public.subscriptions s
  where s.company_id = v_alert.record_id and s.deleted_at is null;

  return public.link_company_to_reseller(
    v_alert.record_id,
    (v_alert.new_values ->> 'reseller_id')::uuid,
    (v_alert.new_values ->> 'plan_id')::uuid,
    v_external
  );
end;
$$;

grant execute on function public.link_company_from_alert(bigint) to authenticated;
