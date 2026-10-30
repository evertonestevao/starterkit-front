-- Testes do módulo de revendedores: regras de comissão nas funções SQL e isolamento
-- entre vendedores. Transação com ROLLBACK final; qualquer falha aborta com RAISE.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Seed: super admin, vendedores A e B, dono das empresas clientes.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, instance_id) values
  ('a0000000-0000-4000-8000-000000000001', 'vendedor-a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('a0000000-0000-4000-8000-000000000002', 'vendedor-b@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('a0000000-0000-4000-8000-000000000003', 'super@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('a0000000-0000-4000-8000-000000000004', 'dono@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

insert into public.platform_admins (user_id) values ('a0000000-0000-4000-8000-000000000003');

insert into public.resellers (id, user_id, name, email, referral_code) values
  ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001', 'Vendedor A', 'vendedor-a@test.local', 'vendedor-a'),
  ('b0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000002', 'Vendedor B', 'vendedor-b@test.local', 'vendedor-b');

insert into public.companies (id, name, slug, created_by)
select ('c0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'Cliente ' || n, 'reseller-cliente-' || n, 'a0000000-0000-4000-8000-000000000004'
from generate_series(1, 20) n;

insert into public.company_members (company_id, user_id, role)
select id, 'a0000000-0000-4000-8000-000000000004', 'owner' from public.companies where slug like 'reseller-cliente-%';

-- Empresa 20 tem o vendedor A como membro: auto-indicação.
insert into public.company_members (company_id, user_id, role)
values ('c0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000001', 'member');

-- Faixas globais: 30% nas 3 primeiras vendas, 40% da 4ª em diante.
insert into public.commission_rules (from_sale_number, commission_type, commission_percent) values
  (1, 'percent', 30), (4, 'percent', 40);

-- Regras do vendedor B: genérica de 50% e fixa para o plano enterprise.
insert into public.commission_rules (reseller_id, commission_type, commission_percent)
values ('b0000000-0000-4000-8000-00000000000b', 'percent', 50);
insert into public.commission_rules (reseller_id, plan_id, commission_type, commission_fixed_cents)
select 'b0000000-0000-4000-8000-00000000000b', id, 'fixed', 1000 from public.plans where code = 'enterprise';

-- Atalhos de teste, descartados no ROLLBACK.
create function pg_temp.c(n int) returns uuid language sql as
  $$ select ('c0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create function pg_temp.plan(p_code text) returns uuid language sql as
  $$ select id from public.plans where code = p_code $$;
create function pg_temp.a() returns uuid language sql as $$ select 'b0000000-0000-4000-8000-00000000000a'::uuid $$;
create function pg_temp.b() returns uuid language sql as $$ select 'b0000000-0000-4000-8000-00000000000b'::uuid $$;
create function pg_temp.amount(p_payment text) returns int language sql as
  $$ select amount_cents from public.reseller_commissions where gateway = 'asaas' and external_payment_id = p_payment $$;

-- ---------------------------------------------------------------------------
-- Flag desligada (padrão) e plano não liberado barram vínculo novo.
-- ---------------------------------------------------------------------------
do $$
begin
  if public.resellers_enabled() then raise exception 'FALHA flag: deveria nascer desligada'; end if;
  if (select reseller_self_signup from public.reseller_settings) then raise exception 'FALHA flag: self signup ligado'; end if;
  if (select count(*) from public.plans where available_to_resellers) <> 0 then raise exception 'FALHA planos: nascem liberados'; end if;

  if public.link_company_to_reseller(pg_temp.c(1), pg_temp.a(), pg_temp.plan('pro'), 'sub-1') is not null then
    raise exception 'FALHA flag: vinculou com o módulo desligado';
  end if;

  update public.reseller_settings set resellers_enabled = true;
  if public.link_company_to_reseller(pg_temp.c(1), pg_temp.a(), pg_temp.plan('pro'), 'sub-1') is not null then
    raise exception 'FALHA planos: vinculou plano não liberado';
  end if;

  update public.plans set available_to_resellers = true where code in ('pro', 'enterprise');
end $$;

-- ---------------------------------------------------------------------------
-- Faixas por nº da venda e prioridade das regras.
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
  v numeric;
begin
  foreach n in array array[1, 2, 3, 4] loop
    perform public.link_company_to_reseller(pg_temp.c(n), pg_temp.a(), pg_temp.plan('pro'), 'sub-' || n);
    select commission_percent into v from public.reseller_clients where company_id = pg_temp.c(n);
    if v is distinct from (case when n < 4 then 30 else 40 end)::numeric then
      raise exception 'FALHA faixas: venda % ficou com %', n, v;
    end if;
    if (select sale_number from public.reseller_clients where company_id = pg_temp.c(n)) <> n then
      raise exception 'FALHA faixas: nº da venda errado em %', n;
    end if;
  end loop;

  -- Regra do vendedor vence a global.
  perform public.link_company_to_reseller(pg_temp.c(5), pg_temp.b(), pg_temp.plan('pro'), 'sub-5');
  select commission_percent into v from public.reseller_clients where company_id = pg_temp.c(5);
  if v is distinct from 50::numeric then raise exception 'FALHA prioridade: vendedor > global, veio %', v; end if;

  -- Regra de plano vence a genérica.
  perform public.link_company_to_reseller(pg_temp.c(6), pg_temp.b(), pg_temp.plan('enterprise'), 'sub-6');
  select commission_fixed_cents into n from public.reseller_clients where company_id = pg_temp.c(6);
  if n is distinct from 1000 then raise exception 'FALHA prioridade: plano > genérica, veio %', n; end if;

  -- Vale o primeiro vendedor: B não toma o cliente de A.
  if public.link_company_to_reseller(pg_temp.c(1), pg_temp.b(), pg_temp.plan('pro'), 'sub-1')
     is distinct from (select id from public.reseller_clients where company_id = pg_temp.c(1)) then
    raise exception 'FALHA primeiro vendedor: retorno inesperado';
  end if;
  if (select reseller_id from public.reseller_clients where company_id = pg_temp.c(1)) <> pg_temp.a() then
    raise exception 'FALHA primeiro vendedor: cliente trocou de vendedor';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Recusas: auto-indicação, suspenso, cliente com pagamento anterior, sem regra.
-- ---------------------------------------------------------------------------
do $$
begin
  if public.link_company_to_reseller(pg_temp.c(20), pg_temp.a(), pg_temp.plan('pro'), 'sub-20') is not null then
    raise exception 'FALHA auto-indicação: vinculou';
  end if;

  update public.resellers set status = 'suspended' where id = pg_temp.b();
  if public.link_company_to_reseller(pg_temp.c(7), pg_temp.b(), pg_temp.plan('pro'), 'sub-7') is not null then
    raise exception 'FALHA suspenso: vinculou';
  end if;
  update public.resellers set status = 'active' where id = pg_temp.b();

  insert into public.subscriptions (company_id, plan_id, status, external_subscription_id, deleted_at)
  values (pg_temp.c(8), pg_temp.plan('pro'), 'canceled', 'sub-antiga', now());
  if public.link_company_to_reseller(pg_temp.c(8), pg_temp.a(), pg_temp.plan('pro'), 'sub-nova') is not null then
    raise exception 'FALHA cliente antigo: vinculou';
  end if;

  update public.commission_rules set active = false;
  if public.link_company_to_reseller(pg_temp.c(9), pg_temp.a(), pg_temp.plan('pro'), 'sub-9') is not null then
    raise exception 'FALHA sem regra: vinculou';
  end if;
  if not exists (
    select 1 from public.reseller_audit_log where action = 'LINK_NO_RULE' and record_id = pg_temp.c(9)
  ) then
    raise exception 'FALHA sem regra: não deixou alerta';
  end if;
  update public.commission_rules set active = true;
end $$;

-- ---------------------------------------------------------------------------
-- Lançamentos: cálculo, idempotência, plano anual, duração, override.
-- ---------------------------------------------------------------------------
do $$
declare
  v_first uuid;
begin
  v_first := public.register_commission(pg_temp.c(1), 'asaas', 'pay-1', 10000);
  if pg_temp.amount('pay-1') <> 3000 then raise exception 'FALHA cálculo: 30%% veio %', pg_temp.amount('pay-1'); end if;

  if public.register_commission(pg_temp.c(1), 'asaas', 'pay-1', 10000) is not null then
    raise exception 'FALHA idempotência: webhook repetido gerou lançamento';
  end if;
  if (select count(*) from public.reseller_commissions where external_payment_id = 'pay-1') <> 1 then
    raise exception 'FALHA idempotência: duplicou';
  end if;

  -- Mesmo id em outro gateway é outro pagamento.
  if public.register_commission(pg_temp.c(1), 'stripe', 'pay-1', 10000) is null then
    raise exception 'FALHA gateway: par único deveria aceitar outro gateway';
  end if;

  -- Sem vínculo não gera.
  if public.register_commission(pg_temp.c(10), 'asaas', 'pay-sem-vinculo', 10000) is not null then
    raise exception 'FALHA vínculo: gerou sem cliente vinculado';
  end if;

  -- Anual: percentual sobre o pago; fixo vezes os 12 meses.
  perform public.register_commission(pg_temp.c(5), 'asaas', 'pay-anual-pct', 120000, 12);
  if pg_temp.amount('pay-anual-pct') <> 60000 then raise exception 'FALHA anual percentual: %', pg_temp.amount('pay-anual-pct'); end if;
  perform public.register_commission(pg_temp.c(6), 'asaas', 'pay-anual-fixo', 120000, 12);
  if pg_temp.amount('pay-anual-fixo') <> 12000 then raise exception 'FALHA anual fixo: %', pg_temp.amount('pay-anual-fixo'); end if;

  -- Duração de 2 meses: o 3º não gera; reverter um libera a vaga.
  update public.reseller_clients set duration_months = 2 where company_id = pg_temp.c(2);
  perform public.register_commission(pg_temp.c(2), 'asaas', 'dur-1', 10000);
  perform public.register_commission(pg_temp.c(2), 'asaas', 'dur-2', 10000);
  if public.register_commission(pg_temp.c(2), 'asaas', 'dur-3', 10000) is not null then
    raise exception 'FALHA duração: gerou além do limite';
  end if;
  perform public.reverse_commission('asaas', 'dur-2');
  if public.register_commission(pg_temp.c(2), 'asaas', 'dur-4', 10000) is null then
    raise exception 'FALHA duração: lançamento revertido não deveria contar';
  end if;

  -- Duração em meses cobertos: anual esgota uma duração de 12.
  update public.reseller_clients set duration_months = 12 where company_id = pg_temp.c(4);
  perform public.register_commission(pg_temp.c(4), 'asaas', 'dur-anual', 120000, 12);
  if public.register_commission(pg_temp.c(4), 'asaas', 'dur-anual-2', 120000, 12) is not null then
    raise exception 'FALHA duração anual: contou lançamentos, não meses';
  end if;

  -- Duração x plano anual: proporcional ao que resta, nunca o valor cheio.
  -- Anual com duração 6, percentual (venda com 40%): 48000 x 6/12.
  perform public.link_company_to_reseller(pg_temp.c(12), pg_temp.a(), pg_temp.plan('pro'), 'sub-12');
  update public.reseller_clients set duration_months = 6 where company_id = pg_temp.c(12);
  perform public.register_commission(pg_temp.c(12), 'asaas', 'prop-pct', 120000, 12);
  if pg_temp.amount('prop-pct') <> 24000 then raise exception 'FALHA proporcional percentual: %', pg_temp.amount('prop-pct'); end if;
  if public.register_commission(pg_temp.c(12), 'asaas', 'prop-pct-2', 120000, 12) is not null then
    raise exception 'FALHA proporcional: gerou depois de esgotar';
  end if;

  -- Anual com duração 6, fixo de 1000 por mês: 6 meses, não 12.
  perform public.link_company_to_reseller(pg_temp.c(13), pg_temp.a(), pg_temp.plan('pro'), 'sub-13');
  update public.reseller_clients
  set commission_type = 'fixed', commission_percent = null, commission_fixed_cents = 1000, duration_months = 6
  where company_id = pg_temp.c(13);
  perform public.register_commission(pg_temp.c(13), 'asaas', 'prop-fixo', 120000, 12);
  if pg_temp.amount('prop-fixo') <> 6000 then raise exception 'FALHA proporcional fixo: %', pg_temp.amount('prop-fixo'); end if;

  -- Duração 18: primeiro ano cheio, segundo com os 6 meses restantes, terceiro nada.
  perform public.link_company_to_reseller(pg_temp.c(14), pg_temp.a(), pg_temp.plan('pro'), 'sub-14');
  update public.reseller_clients set duration_months = 18 where company_id = pg_temp.c(14);
  perform public.register_commission(pg_temp.c(14), 'asaas', 'prop-18-1', 120000, 12);
  perform public.register_commission(pg_temp.c(14), 'asaas', 'prop-18-2', 120000, 12);
  if pg_temp.amount('prop-18-1') <> 48000 or pg_temp.amount('prop-18-2') <> 24000 then
    raise exception 'FALHA duração 18: % e %', pg_temp.amount('prop-18-1'), pg_temp.amount('prop-18-2');
  end if;
  if public.register_commission(pg_temp.c(14), 'asaas', 'prop-18-3', 120000, 12) is not null then
    raise exception 'FALHA duração 18: gerou depois de esgotar';
  end if;

  -- Anual sem duração: sempre cheio.
  perform public.register_commission(pg_temp.c(5), 'asaas', 'pay-anual-pct-2', 120000, 12);
  if pg_temp.amount('pay-anual-pct-2') <> 60000 then raise exception 'FALHA anual sem duração: %', pg_temp.amount('pay-anual-pct-2'); end if;

  -- Mensal com duração: cada mês cheio.
  if pg_temp.amount('dur-1') <> 3000 or pg_temp.amount('dur-4') <> 3000 then
    raise exception 'FALHA mensal com duração: % e %', pg_temp.amount('dur-1'), pg_temp.amount('dur-4');
  end if;

  -- Override: só os próximos mudam.
  perform public.register_commission(pg_temp.c(3), 'asaas', 'ovr-1', 10000);
  update public.reseller_clients set commission_percent = 50, is_override = true where company_id = pg_temp.c(3);
  perform public.register_commission(pg_temp.c(3), 'asaas', 'ovr-2', 10000);
  if pg_temp.amount('ovr-1') <> 3000 or pg_temp.amount('ovr-2') <> 5000 then
    raise exception 'FALHA override: % e %', pg_temp.amount('ovr-1'), pg_temp.amount('ovr-2');
  end if;

  -- Regra global editada não mexe em vínculo existente.
  update public.commission_rules set commission_percent = 10 where reseller_id is null and from_sale_number = 1;
  perform public.register_commission(pg_temp.c(1), 'asaas', 'pay-2', 10000);
  if pg_temp.amount('pay-2') <> 3000 then raise exception 'FALHA regra editada: afetou vínculo'; end if;
  update public.commission_rules set commission_percent = 30 where reseller_id is null and from_sale_number = 1;
end $$;

-- ---------------------------------------------------------------------------
-- Estorno: pendente reverte, parcial é proporcional, pago só sinaliza.
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.register_commission(pg_temp.c(1), 'asaas', 'est-1', 10000);
  if not public.reverse_commission('asaas', 'est-1') then raise exception 'FALHA estorno: não reverteu'; end if;
  if (select status from public.reseller_commissions where external_payment_id = 'est-1') <> 'reversed' then
    raise exception 'FALHA estorno: status errado';
  end if;
  if public.reverse_commission('asaas', 'est-1') then raise exception 'FALHA estorno: repetido alterou'; end if;

  perform public.register_commission(pg_temp.c(1), 'asaas', 'est-parcial', 10000);
  perform public.reverse_commission('asaas', 'est-parcial', 5000);
  if pg_temp.amount('est-parcial') <> 1500 then raise exception 'FALHA parcial: %', pg_temp.amount('est-parcial'); end if;
  if public.reverse_commission('asaas', 'est-parcial', 5000) then raise exception 'FALHA parcial: evento repetido alterou'; end if;
  perform public.reverse_commission('asaas', 'est-parcial', 7500);
  if pg_temp.amount('est-parcial') <> 750 then raise exception 'FALHA parcial acumulado: %', pg_temp.amount('est-parcial'); end if;
  perform public.reverse_commission('asaas', 'est-parcial', 10000);
  if (select status from public.reseller_commissions where external_payment_id = 'est-parcial') <> 'reversed' then
    raise exception 'FALHA parcial: total não reverteu';
  end if;

  perform public.register_commission(pg_temp.c(1), 'asaas', 'est-pago', 10000);
  update public.reseller_commissions set status = 'paid', paid_at = now() where external_payment_id = 'est-pago';
  if public.reverse_commission('asaas', 'est-pago') then raise exception 'FALHA pago: alterou'; end if;
  if (select status <> 'paid' or refund_flagged_at is null or amount_cents <> 3000
      from public.reseller_commissions where external_payment_id = 'est-pago') then
    raise exception 'FALHA pago: deveria ficar pago e sinalizado';
  end if;

  if public.reverse_commission('asaas', 'nao-existe') then raise exception 'FALHA estorno: pagamento inexistente'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Cancelamento e volta em até 90 dias. Módulo desligado continua gerando.
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.end_reseller_client(pg_temp.c(1));
  if (select ended_at is null from public.reseller_clients where company_id = pg_temp.c(1)) then
    raise exception 'FALHA cancelamento: não encerrou';
  end if;
  if public.register_commission(pg_temp.c(1), 'asaas', 'volta-1', 10000) is null then
    raise exception 'FALHA volta: deveria reabrir em até 90 dias';
  end if;
  if (select ended_at is not null from public.reseller_clients where company_id = pg_temp.c(1)) then
    raise exception 'FALHA volta: vínculo não reabriu';
  end if;

  update public.reseller_clients set ended_at = now() - interval '91 days' where company_id = pg_temp.c(1);
  if public.register_commission(pg_temp.c(1), 'asaas', 'volta-2', 10000) is not null then
    raise exception 'FALHA volta: reabriu depois de 90 dias';
  end if;
  update public.reseller_clients set ended_at = null where company_id = pg_temp.c(1);

  -- O prazo é configurável.
  if (select client_return_window_days from public.reseller_settings) <> 90 then
    raise exception 'FALHA prazo: padrão deveria ser 90 dias';
  end if;
  update public.reseller_settings set client_return_window_days = 30;
  update public.reseller_clients set ended_at = now() - interval '31 days' where company_id = pg_temp.c(1);
  if public.register_commission(pg_temp.c(1), 'asaas', 'prazo-1', 10000) is not null then
    raise exception 'FALHA prazo: reabriu fora dos 30 dias';
  end if;
  update public.reseller_clients set ended_at = now() - interval '29 days' where company_id = pg_temp.c(1);
  if public.register_commission(pg_temp.c(1), 'asaas', 'prazo-2', 10000) is null then
    raise exception 'FALHA prazo: não reabriu dentro dos 30 dias';
  end if;

  update public.reseller_settings set resellers_enabled = false;
  if public.register_commission(pg_temp.c(1), 'asaas', 'desligado-1', 10000) is null then
    raise exception 'FALHA flag: desligar não pode parar comissão de quem já vendeu';
  end if;
  if public.link_company_to_reseller(pg_temp.c(11), pg_temp.a(), pg_temp.plan('pro'), 'sub-11') is not null then
    raise exception 'FALHA flag: vinculou novo cliente com módulo desligado';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Vendedor A: vê só o dele, pelas views. Tabelas internas fechadas. Módulo desligado
-- (estado atual): continua vendo clientes e comissões, mas não planos para vender.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$
declare
  n int;
begin
  select count(*) into n from public.reseller_me;
  if n <> 1 then raise exception 'FALHA me: esperado 1, veio %', n; end if;

  if not exists (select 1 from public.reseller_my_clients) then raise exception 'FALHA flag: painel sumiu com módulo desligado'; end if;
  if not exists (select 1 from public.reseller_my_commissions) then raise exception 'FALHA flag: comissões sumiram com módulo desligado'; end if;
  if exists (select 1 from public.reseller_available_plans) then raise exception 'FALHA flag: planos à venda com módulo desligado'; end if;

  -- Dados do vendedor B (clientes 5 e 6) não aparecem.
  if exists (select 1 from public.reseller_my_clients where client_name in ('Cliente 5', 'Cliente 6')) then
    raise exception 'FALHA isolamento: A viu cliente de B';
  end if;
  if exists (select 1 from public.reseller_my_commissions where client_name in ('Cliente 5', 'Cliente 6')) then
    raise exception 'FALHA isolamento: A viu comissão de B';
  end if;

  -- Tabelas internas: nenhuma linha, nem a do próprio vendedor.
  select count(*) into n from public.resellers;
  if n <> 0 then raise exception 'FALHA interna: resellers visível'; end if;
  select count(*) into n from public.commission_rules;
  if n <> 0 then raise exception 'FALHA interna: commission_rules visível'; end if;
  select count(*) into n from public.reseller_clients;
  if n <> 0 then raise exception 'FALHA interna: reseller_clients visível'; end if;
  select count(*) into n from public.reseller_commissions;
  if n <> 0 then raise exception 'FALHA interna: reseller_commissions visível'; end if;
  select count(*) into n from public.reseller_audit_log;
  if n <> 0 then raise exception 'FALHA interna: audit log visível'; end if;
  select count(*) into n from public.reseller_settings;
  if n <> 0 then raise exception 'FALHA interna: settings visível'; end if;

  -- Não altera o próprio valor nem se marca como pago.
  update public.reseller_commissions set amount_cents = 999999;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA escrita: vendedor alterou lançamento'; end if;
  update public.reseller_settings set resellers_enabled = true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA escrita: vendedor ligou o módulo'; end if;

  begin
    insert into public.commission_rules (reseller_id, commission_type, commission_percent)
    values ('b0000000-0000-4000-8000-00000000000a', 'percent', 100);
    raise exception 'FALHA escrita: vendedor criou regra';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform public.register_commission('c0000000-0000-4000-8000-000000000001', 'asaas', 'forjado', 999999);
    raise exception 'FALHA função: vendedor forjou lançamento';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.reverse_commission('asaas', 'pay-1');
    raise exception 'FALHA função: vendedor chamou reverse_commission';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.link_company_to_reseller('c0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-00000000000a', null, 'x');
    raise exception 'FALHA função: vendedor chamou link';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform * from public.resolve_commission('b0000000-0000-4000-8000-00000000000b', null, 1);
    raise exception 'FALHA função: vendedor leu regra alheia';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.set_plan_available_to_resellers((select id from public.plans where code = 'free'), true);
    raise exception 'FALHA função: vendedor liberou plano';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- Colunas internas ficam fora das views.
reset role;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('reseller_my_clients', 'reseller_my_commissions')
      and column_name in ('company_id', 'external_payment_id', 'gateway', 'reseller_id')
  ) then
    raise exception 'FALHA views: expõem coluna interna';
  end if;
end $$;

-- Vendedor B: enxerga só os dele. Módulo ligado de novo para checar planos.
update public.reseller_settings set resellers_enabled = true;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

do $$
begin
  if exists (select 1 from public.reseller_my_clients where client_name not in ('Cliente 5', 'Cliente 6')) then
    raise exception 'FALHA isolamento: B viu cliente de A';
  end if;
  if (select count(*) from public.reseller_my_clients) <> 2 then raise exception 'FALHA isolamento: B deveria ver 2'; end if;
  if (select count(*) from public.reseller_available_plans) <> 2 then raise exception 'FALHA planos: B deveria ver os 2 liberados'; end if;
  if exists (select 1 from public.reseller_available_plans where code = 'free') then raise exception 'FALHA planos: free apareceu'; end if;
end $$;

-- Dono de empresa cliente, sem cadastro de vendedor: nada.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.reseller_me) or exists (select 1 from public.reseller_my_clients)
     or exists (select 1 from public.reseller_available_plans) then
    raise exception 'FALHA não-vendedor: enxergou dados do módulo';
  end if;
end $$;
reset role;

-- Suspenso perde o painel; os lançamentos ficam preservados.
update public.resellers set status = 'suspended' where id = 'b0000000-0000-4000-8000-00000000000b';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.reseller_me) or exists (select 1 from public.reseller_my_clients)
     or exists (select 1 from public.reseller_my_commissions) then
    raise exception 'FALHA suspenso: manteve acesso ao painel';
  end if;
end $$;
reset role;
do $$
begin
  if (select count(*) from public.reseller_commissions where reseller_id = 'b0000000-0000-4000-8000-00000000000b') = 0 then
    raise exception 'FALHA suspenso: lançamentos sumiram';
  end if;
end $$;

-- anon: nem views, nem tabelas.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform 1 from public.reseller_my_clients;
    raise exception 'FALHA anon: leu view';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform 1 from public.resellers;
    raise exception 'FALHA anon: leu tabela';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform available_to_resellers from public.plans;
    raise exception 'FALHA anon: leu available_to_resellers';
  exception when sqlstate '42501' then null;
  end;
  if not exists (select name from public.plans where code = 'pro') then
    raise exception 'FALHA anon: página de preços perdeu os planos';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Super admin: administra pelas tabelas e o histórico registra quem mudou o quê.
-- Backend (service_role) executa as funções de escrita.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare
  n int;
begin
  select count(*) into n from public.resellers where referral_code like 'vendedor-%';
  if n <> 2 then raise exception 'FALHA super: esperado 2 vendedores, veio %', n; end if;

  update public.reseller_commissions set amount_cents = 2500 where external_payment_id = 'pay-2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA super: não editou lançamento'; end if;

  if not exists (
    select 1 from public.reseller_audit_log
    where table_name = 'reseller_commissions'
      and changed_by = 'a0000000-0000-4000-8000-000000000003'
      and (old_values ->> 'amount_cents')::int = 3000
      and (new_values ->> 'amount_cents')::int = 2500
  ) then
    raise exception 'FALHA histórico: edição sem quem/de quanto/para quanto';
  end if;

  perform public.set_plan_available_to_resellers((select id from public.plans where code = 'pro'), false);
  if exists (select 1 from public.plans where code = 'pro' and available_to_resellers) then
    raise exception 'FALHA super: não escondeu o plano';
  end if;
  if not exists (
    select 1 from public.reseller_audit_log
    where table_name = 'plans' and changed_by = 'a0000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'FALHA histórico: liberação de plano sem registro';
  end if;

  begin
    insert into public.reseller_audit_log (table_name, action) values ('x', 'forjado');
    raise exception 'FALHA histórico: super admin forjou registro';
  exception when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- Esconder plano não afeta quem já vendeu: o cliente segue aparecendo.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  if not exists (select 1 from public.reseller_my_clients where plan_name = 'Pro') then
    raise exception 'FALHA plano escondido: cliente antigo sumiu';
  end if;
end $$;
reset role;

set local role service_role;
do $$
begin
  if public.register_commission('c0000000-0000-4000-8000-000000000003', 'asaas', 'backend-1', 10000) is null then
    raise exception 'FALHA backend: service_role não gerou lançamento';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Link de afiliado: validação do código e gravação no cadastro da empresa.
-- ---------------------------------------------------------------------------
insert into public.resellers (id, name, email, referral_code) values
  ('b0000000-0000-4000-8000-00000000000c', 'Vendedor C', 'dono@test.local', 'vendedor-c');

do $$
declare
  v_first uuid;
begin
  if not public.is_valid_referral_code('vendedor-a') then raise exception 'FALHA link: código ativo recusado'; end if;
  if public.is_valid_referral_code('vendedor-b') then raise exception 'FALHA link: código suspenso aceito'; end if;
  if public.is_valid_referral_code('nao-existe') then raise exception 'FALHA link: código inexistente aceito'; end if;

  -- Vale o primeiro vendedor.
  v_first := public.record_company_referral(pg_temp.c(15), 'vendedor-a', 'a0000000-0000-4000-8000-000000000004');
  if v_first is null then raise exception 'FALHA link: não gravou'; end if;
  update public.resellers set status = 'active' where id = pg_temp.b();
  if public.record_company_referral(pg_temp.c(15), 'vendedor-b', 'a0000000-0000-4000-8000-000000000004') is not null then
    raise exception 'FALHA link: segundo vendedor sobrescreveu';
  end if;
  if (select reseller_id from public.reseller_referrals where company_id = pg_temp.c(15)) <> pg_temp.a() then
    raise exception 'FALHA link: vendedor trocado';
  end if;
  update public.resellers set status = 'suspended' where id = pg_temp.b();

  -- Código suspenso não grava.
  if public.record_company_referral(pg_temp.c(16), 'vendedor-b', 'a0000000-0000-4000-8000-000000000004') is not null then
    raise exception 'FALHA link: gravou suspenso';
  end if;

  -- Auto-indicação pelo mesmo usuário.
  if public.record_company_referral(pg_temp.c(16), 'vendedor-a', 'a0000000-0000-4000-8000-000000000001') is not null then
    raise exception 'FALHA auto-indicação: mesmo usuário gravou';
  end if;

  -- Auto-indicação pelo mesmo e-mail: vendedor C, sem conta, tem o e-mail do dono.
  if public.record_company_referral(pg_temp.c(16), 'vendedor-c', 'a0000000-0000-4000-8000-000000000004') is not null then
    raise exception 'FALHA auto-indicação: mesmo e-mail gravou';
  end if;
  if public.link_company_to_reseller(pg_temp.c(16), 'b0000000-0000-4000-8000-00000000000c', pg_temp.plan('enterprise'), 'sub-16') is not null then
    raise exception 'FALHA auto-indicação: mesmo e-mail vinculou';
  end if;

  -- Módulo desligado: código deixa de valer.
  update public.reseller_settings set resellers_enabled = false;
  if public.is_valid_referral_code('vendedor-a') then raise exception 'FALHA link: módulo desligado aceitou'; end if;
  if public.record_company_referral(pg_temp.c(17), 'vendedor-a', 'a0000000-0000-4000-8000-000000000004') is not null then
    raise exception 'FALHA link: gravou com módulo desligado';
  end if;
  update public.reseller_settings set resellers_enabled = true;
end $$;

-- Cliente e vendedor não leem nem gravam a atribuição; só o super admin lê.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.reseller_referrals) then raise exception 'FALHA link: cliente leu a atribuição'; end if;
  begin
    insert into public.reseller_referrals (company_id, reseller_id, referral_code)
    values ('c0000000-0000-4000-8000-000000000018', 'b0000000-0000-4000-8000-00000000000a', 'vendedor-a');
    raise exception 'FALHA link: cliente gravou a atribuição';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.record_company_referral('c0000000-0000-4000-8000-000000000018', 'vendedor-a', null);
    raise exception 'FALHA link: cliente chamou a função de gravação';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.is_valid_referral_code('vendedor-a');
    raise exception 'FALHA link: cliente testou código';
  exception when sqlstate '42501' then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  if not exists (select 1 from public.reseller_referrals) then raise exception 'FALHA link: super admin não leu'; end if;
end $$;
reset role;

-- Conta do vendedor excluída: user_id vira NULL e os lançamentos ficam.
do $$
begin
  delete from auth.users where id = 'a0000000-0000-4000-8000-000000000002';
  if (select user_id is not null from public.resellers where id = 'b0000000-0000-4000-8000-00000000000b') then
    raise exception 'FALHA exclusão: user_id não virou NULL';
  end if;
  if (select count(*) from public.reseller_commissions where reseller_id = 'b0000000-0000-4000-8000-00000000000b') = 0 then
    raise exception 'FALHA exclusão: lançamentos sumiram';
  end if;
end $$;

rollback;

\echo 'RESELLERS OK: regras de comissão e isolamento entre vendedores passaram.'
