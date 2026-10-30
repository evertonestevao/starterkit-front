-- Fase 3: vínculo na contratação e pendências de comissão.

-- Falha ao processar comissão nunca derruba o pagamento: fica aqui para reprocesso
-- manual. payload é o evento NORMALIZADO, sem dados de cartão nem o corpo cru do gateway.
-- Sem company_id porque a falha pode acontecer antes de a empresa ser resolvida.
create table public.reseller_commission_failures (
  id uuid primary key default gen_random_uuid(),
  gateway text not null,
  event_type text not null,
  external_id text not null,
  error text not null,
  payload jsonb not null,
  attempts integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reseller_commission_failures_event_unique unique (gateway, event_type, external_id)
);

create index reseller_commission_failures_pending_idx
  on public.reseller_commission_failures (created_at)
  where status = 'pending';

create trigger set_reseller_commission_failures_updated_at
  before update on public.reseller_commission_failures
  for each row
  execute function public.set_updated_at();

alter table public.reseller_commission_failures enable row level security;

grant select on public.reseller_commission_failures to authenticated;

-- Só o super admin lê; escrita é do backend, inclusive o reprocesso.
create policy "reseller_commission_failures_super_admin" on public.reseller_commission_failures
  for select to authenticated
  using (public.is_super_admin());

-- Mesmo evento falhando de novo soma tentativa e volta a pendente, sem duplicar.
create or replace function public.record_commission_failure(
  p_gateway text,
  p_event_type text,
  p_external_id text,
  p_error text,
  p_payload jsonb
)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.reseller_commission_failures (gateway, event_type, external_id, error, payload)
  values (p_gateway, p_event_type, p_external_id, p_error, p_payload)
  on conflict (gateway, event_type, external_id) do update
    set error = excluded.error,
        payload = excluded.payload,
        attempts = public.reseller_commission_failures.attempts + 1,
        status = 'pending',
        resolved_at = null
  returning id;
$$;

-- Contratação: o vínculo precisa existir antes do primeiro pagamento. p_referral_code é
-- o cookie, se houver; sem ele vale a indicação já gravada no cadastro da empresa.
create or replace function public.link_company_at_checkout(
  p_company_id uuid,
  p_referral_code text,
  p_user_id uuid,
  p_plan_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_reseller_id uuid;
begin
  select rc.id into v_existing
  from public.reseller_clients rc
  where rc.company_id = p_company_id;
  if found then
    return v_existing;
  end if;

  -- Quem já pagou antes não é venda nova nem ganha indicação agora.
  if exists (
    select 1 from public.subscriptions s
    where s.company_id = p_company_id and s.external_subscription_id is not null
  ) then
    return null;
  end if;

  if p_referral_code is not null then
    perform public.record_company_referral(p_company_id, p_referral_code, p_user_id);
  end if;

  select rr.reseller_id into v_reseller_id
  from public.reseller_referrals rr
  where rr.company_id = p_company_id and rr.deleted_at is null;
  if not found then
    return null;
  end if;

  return public.link_company_to_reseller(p_company_id, v_reseller_id, p_plan_id, null);
end;
$$;

grant execute on function
  public.record_commission_failure(text, text, text, text, jsonb),
  public.link_company_at_checkout(uuid, text, uuid, uuid)
to service_role;
