-- Comissão fixa passa a valer por pagamento recebido: o vendedor recebe como a plataforma
-- recebe. Anual à vista gera 1 comissão, e 12 cobranças geram 12. Antes o fixo era
-- multiplicado pelos meses cobertos. A duração continua contando meses cobertos e, quando
-- resta menos que o pagamento cobre, o valor é proporcional, como já era no percentual.

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
    else round(v_client.commission_fixed_cents::numeric * v_months_payable / p_months_covered)
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
