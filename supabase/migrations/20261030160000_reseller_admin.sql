-- Fase 4: leitura do painel do super admin. A RLS de companies só mostra empresa a quem é
-- membro, de propósito; estas views dão ao super admin só o nome do cliente, sem abrir a
-- tabela. Rodam como dono e filtram por is_super_admin(): qualquer outro usuário vê zero linhas.

create view public.reseller_admin_totals with (security_barrier = true) as
select
  r.id,
  r.name,
  r.email,
  r.referral_code,
  r.status,
  r.user_id is not null as has_account,
  r.created_at,
  (select count(*) from public.reseller_clients rc
    where rc.reseller_id = r.id and rc.ended_at is null and rc.deleted_at is null) as active_clients,
  (select coalesce(sum(c.amount_cents), 0) from public.reseller_commissions c
    where c.reseller_id = r.id and c.status = 'pending' and c.deleted_at is null) as pending_cents,
  (select coalesce(sum(c.amount_cents), 0) from public.reseller_commissions c
    where c.reseller_id = r.id and c.status = 'paid' and c.deleted_at is null) as paid_cents
from public.resellers r
where r.deleted_at is null
  and public.is_super_admin();

create view public.reseller_admin_clients with (security_barrier = true) as
select
  rc.id,
  rc.reseller_id,
  c.name as client_name,
  p.name as plan_name,
  rc.sale_number,
  rc.commission_type,
  rc.commission_percent,
  rc.commission_fixed_cents,
  rc.duration_months,
  rc.is_override,
  rc.started_at,
  rc.ended_at
from public.reseller_clients rc
join public.companies c on c.id = rc.company_id
left join public.plans p on p.id = rc.plan_id
where rc.deleted_at is null
  and public.is_super_admin();

create view public.reseller_admin_commissions with (security_barrier = true) as
select
  rm.id,
  rm.reseller_id,
  r.name as reseller_name,
  c.name as client_name,
  rc.plan_id,
  p.name as plan_name,
  rm.base_amount_cents,
  rm.months_covered,
  rm.commission_type,
  rm.commission_percent,
  rm.commission_fixed_cents,
  rm.amount_cents,
  rm.status,
  rm.paid_at,
  rm.refund_flagged_at,
  rm.created_at
from public.reseller_commissions rm
join public.resellers r on r.id = rm.reseller_id
join public.companies c on c.id = rm.company_id
join public.reseller_clients rc on rc.id = rm.reseller_client_id
left join public.plans p on p.id = rc.plan_id
where rm.deleted_at is null
  and public.is_super_admin();

-- Venda sem regra aplicável: o último alerta de cada empresa que segue sem vínculo.
create view public.reseller_admin_link_alerts with (security_barrier = true) as
select distinct on (a.record_id)
  a.id,
  a.changed_at,
  c.name as client_name,
  r.name as reseller_name,
  p.name as plan_name
from public.reseller_audit_log a
join public.companies c on c.id = a.record_id
left join public.resellers r on r.id = (a.new_values ->> 'reseller_id')::uuid
left join public.plans p on p.id = (a.new_values ->> 'plan_id')::uuid
where a.action = 'LINK_NO_RULE'
  and not exists (select 1 from public.reseller_clients rc where rc.company_id = a.record_id)
  and public.is_super_admin()
order by a.record_id, a.changed_at desc;

grant select on
  public.reseller_admin_totals,
  public.reseller_admin_clients,
  public.reseller_admin_commissions,
  public.reseller_admin_link_alerts
to authenticated;

-- Convite: e-mail que já tem conta só ganha o papel de vendedor, sem novo cadastro.
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select u.id from auth.users u where lower(u.email) = lower(p_email) limit 1;
$$;

grant execute on function public.find_user_id_by_email(text) to service_role;
