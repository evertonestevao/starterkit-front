-- Testes de RLS (plano §6/§12): prova em banco real que um tenant não lê nem
-- escreve dados de outro. Roda dentro de uma transação com ROLLBACK final —
-- não deixa lixo no banco. Qualquer falha aborta com RAISE EXCEPTION.
--
-- Uso: npm run test:rls (com o Supabase local de pé).

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Seed (como superuser, RLS ignorada de propósito): 2 usuários, 2 empresas.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'rls-alice@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Alice RLS"}'),
  ('b2b2b2b2-0000-4000-8000-000000000002', 'rls-bob@test.local',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Bob RLS"}');

insert into public.companies (id, name, slug, created_by) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'Alice Co', 'rls-alice-co', 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('c2c2c2c2-0000-4000-8000-000000000002', 'Bob Co',   'rls-bob-co',   'b2b2b2b2-0000-4000-8000-000000000002');

insert into public.company_members (company_id, user_id, role) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'owner'),
  ('c2c2c2c2-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-000000000002', 'owner');

insert into public.settings (company_id, key, value) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'rls-test', '"alice"'),
  ('c2c2c2c2-0000-4000-8000-000000000002', 'rls-test', '"bob"');

insert into public.audit_logs (company_id, user_id, action) values
  ('c2c2c2c2-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-000000000002', 'rls.test');

insert into public.subscriptions (company_id, plan_id, status)
select 'c2c2c2c2-0000-4000-8000-000000000002', id, 'active' from public.plans where code = 'pro';

insert into public.company_invites (company_id, email, role, invited_by) values
  ('c2c2c2c2-0000-4000-8000-000000000002', 'convidado@test.local', 'member', 'b2b2b2b2-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- Sessão da ALICE: só pode enxergar/alterar o próprio tenant.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- companies: vê a própria, não vê a do outro tenant
  select count(*) into n from public.companies;
  if n <> 1 then raise exception 'FALHA companies: alice deveria ver 1 empresa, viu %', n; end if;
  select count(*) into n from public.companies where id = 'c2c2c2c2-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA companies: alice enxerga a empresa do bob'; end if;

  -- company_members: só a membership do próprio tenant
  select count(*) into n from public.company_members;
  if n <> 1 then raise exception 'FALHA company_members: esperado 1, veio %', n; end if;

  -- settings / audit_logs / subscriptions / company_invites de outro tenant: invisíveis
  select count(*) into n from public.settings where company_id = 'c2c2c2c2-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA settings: vazou linha de outro tenant'; end if;
  select count(*) into n from public.audit_logs;
  if n <> 0 then raise exception 'FALHA audit_logs: vazou linha de outro tenant'; end if;
  select count(*) into n from public.subscriptions;
  if n <> 0 then raise exception 'FALHA subscriptions: vazou linha de outro tenant'; end if;
  select count(*) into n from public.company_invites;
  if n <> 0 then raise exception 'FALHA company_invites: vazou convite de outro tenant'; end if;

  -- profiles: vê o próprio, não vê o de quem não divide empresa
  select count(*) into n from public.profiles where id = 'b2b2b2b2-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA profiles: alice ve profile de estranho'; end if;
end $$;

-- Escrita cross-tenant deve estourar RLS (42501) — nunca passar em silêncio.
do $$
begin
  begin
    insert into public.settings (company_id, key, value)
    values ('c2c2c2c2-0000-4000-8000-000000000002', 'invasao', '"x"');
    raise exception 'FALHA settings: INSERT cross-tenant foi aceito';
  exception when sqlstate '42501' then null; -- esperado
  end;

  begin
    insert into public.audit_logs (company_id, user_id, action)
    values ('c2c2c2c2-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001', 'invasao');
    raise exception 'FALHA audit_logs: INSERT cross-tenant foi aceito';
  exception when sqlstate '42501' then null;
  end;

  begin
    insert into public.company_members (company_id, user_id, role)
    values ('c2c2c2c2-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001', 'admin');
    raise exception 'FALHA company_members: alice se auto-inseriu no tenant do bob';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- UPDATE cross-tenant não deve afetar nenhuma linha (a policy filtra o alvo).
do $$
declare n int;
begin
  update public.companies set name = 'Hackeada'
  where id = 'c2c2c2c2-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA companies: UPDATE cross-tenant afetou % linha(s)', n; end if;

  update public.company_members set role = 'owner'
  where user_id = 'a1a1a1a1-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  -- update da própria linha exige is_company_admin; alice é owner do c1, então
  -- pode — mas nunca da linha de outro tenant. Confere que não tocou o c2:
  perform 1 from public.company_members
    where company_id = 'c2c2c2c2-0000-4000-8000-000000000002' and role <> 'owner';
  if found then raise exception 'FALHA company_members: papel de outro tenant alterado'; end if;
end $$;

-- audit_logs é imutável para o client: nem sequer há GRANT de UPDATE/DELETE,
-- então o banco nega com 42501 antes mesmo de avaliar RLS.
do $$
begin
  begin
    update public.audit_logs set action = 'adulterado' where true;
    raise exception 'FALHA audit_logs: UPDATE foi aceito';
  exception when sqlstate '42501' then null; -- esperado
  end;
  begin
    delete from public.audit_logs where true;
    raise exception 'FALHA audit_logs: DELETE foi aceito';
  exception when sqlstate '42501' then null;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- RPCs: create_company nasce com owner; convite de outro email é recusado.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare c public.companies;
declare n int;
begin
  select * into c from public.create_company('Empresa Nova', 'rls-empresa-nova');
  select count(*) into n from public.company_members
    where company_id = c.id and user_id = 'a1a1a1a1-0000-4000-8000-000000000001'
      and role = 'owner' and deleted_at is null;
  if n <> 1 then raise exception 'FALHA create_company: empresa sem owner'; end if;
end $$;

reset role;

-- my_pending_invites (RPC security definer): só convites do PRÓPRIO email.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- o convite seedado é para convidado@test.local — alice não vê nada
  select count(*) into n from public.my_pending_invites();
  if n <> 0 then raise exception 'FALHA my_pending_invites: viu convite de outro email'; end if;
end $$;

reset role;

-- seed: convite endereçado à alice na empresa do bob
insert into public.company_invites (company_id, email, role, invited_by) values
  ('c2c2c2c2-0000-4000-8000-000000000002', 'rls-alice@test.local', 'member', 'b2b2b2b2-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare v_name text;
begin
  -- agora alice vê 1 convite, com o nome da empresa (via definer) — e nada mais
  select company_name into v_name from public.my_pending_invites();
  if v_name is distinct from 'Bob Co' then
    raise exception 'FALHA my_pending_invites: esperado convite de Bob Co, veio %', v_name;
  end if;
end $$;

reset role;

-- Alice tenta aceitar convite emitido para outro email: deve falhar.
-- (token copiado para uma GUC como superuser, simulando vazamento do link)
select set_config('test.bob_invite_token', token::text, true)
from public.company_invites
where company_id = 'c2c2c2c2-0000-4000-8000-000000000002'
  and email = 'convidado@test.local'; -- há outro convite (da alice) na mesma empresa

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
begin
  begin
    perform public.accept_company_invite(current_setting('test.bob_invite_token')::uuid);
    raise exception 'FALHA accept_company_invite: aceitou convite de outro email';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
    null; -- exceção da RPC é o comportamento esperado
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Termos e consentimentos (LGPD): aceite só em nome próprio, append-only.
-- ---------------------------------------------------------------------------
-- seed: bob aceita a versão vigente (como superuser, para testar visibilidade)
insert into public.terms_acceptances (user_id, terms_version_id)
select 'b2b2b2b2-0000-4000-8000-000000000002', id from public.terms_versions where is_current;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int;
declare v_version uuid;
begin
  select id into v_version from public.terms_versions where is_current;

  -- termos vigentes são legíveis
  if v_version is null then raise exception 'FALHA terms_versions: versão vigente invisível'; end if;

  -- alice não vê o aceite do bob
  select count(*) into n from public.terms_acceptances;
  if n <> 0 then raise exception 'FALHA terms_acceptances: aceite alheio visível'; end if;

  -- aceite em nome próprio: permitido
  insert into public.terms_acceptances (user_id, terms_version_id)
  values ('a1a1a1a1-0000-4000-8000-000000000001', v_version);

  -- aceite em nome de OUTRO usuário: bloqueado
  begin
    insert into public.terms_acceptances (user_id, terms_version_id)
    values ('b2b2b2b2-0000-4000-8000-000000000002', v_version);
    raise exception 'FALHA terms_acceptances: aceite forjado em nome de outro usuário';
  exception when sqlstate '42501' or unique_violation then
    if sqlerrm like 'FALHA%' then raise; end if;
    null;
  end;

  -- append-only: UPDATE/DELETE sem GRANT (42501)
  begin
    update public.terms_acceptances set accepted_at = now() where true;
    raise exception 'FALHA terms_acceptances: UPDATE foi aceito';
  exception when sqlstate '42501' then null;
  end;
  begin
    delete from public.terms_acceptances where true;
    raise exception 'FALHA terms_acceptances: DELETE foi aceito';
  exception when sqlstate '42501' then null;
  end;

  -- terms_versions: client não publica versão
  begin
    insert into public.terms_versions (version, content, is_current)
    values (99, 'hack', false);
    raise exception 'FALHA terms_versions: INSERT de client foi aceito';
  exception when sqlstate '42501' then null;
  end;

  -- user_consents: em nome próprio ok; em nome de outro, bloqueado
  insert into public.user_consents (user_id, consent_type, granted)
  values ('a1a1a1a1-0000-4000-8000-000000000001', 'email_communications', true);
  begin
    insert into public.user_consents (user_id, consent_type, granted)
    values ('b2b2b2b2-0000-4000-8000-000000000002', 'email_communications', true);
    raise exception 'FALHA user_consents: consentimento forjado para outro usuário';
  exception when sqlstate '42501' then null;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Storage (bucket avatars): cada usuário só escreve na PRÓPRIA pasta.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
begin
  -- na própria pasta: permitido
  insert into storage.objects (bucket_id, name)
  values ('avatars', 'a1a1a1a1-0000-4000-8000-000000000001/avatar.png');

  -- na pasta do bob: bloqueado pela policy
  begin
    insert into storage.objects (bucket_id, name)
    values ('avatars', 'b2b2b2b2-0000-4000-8000-000000000002/avatar.png');
    raise exception 'FALHA storage: alice escreveu na pasta de outro usuário';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- em bucket sem policy de insert: bloqueado
  begin
    insert into storage.objects (bucket_id, name)
    values ('outro-bucket', 'a1a1a1a1-0000-4000-8000-000000000001/x.png');
    raise exception 'FALHA storage: insert aceito em bucket sem policy';
  exception when sqlstate '42501' or foreign_key_violation then null;
  end;
end $$;

reset role;


-- ---------------------------------------------------------------------------
-- transfer_company_ownership: só o owner, só para membro da própria empresa.
-- ---------------------------------------------------------------------------
select set_config('rls.bob_member_id',
  (select id::text from public.company_members
   where user_id = 'b2b2b2b2-0000-4000-8000-000000000002'), true);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
begin
  -- empresa do outro tenant: alice não é owner dela
  begin
    perform public.transfer_company_ownership(
      'c2c2c2c2-0000-4000-8000-000000000002',
      current_setting('rls.bob_member_id')::uuid);
    raise exception 'FALHA ownership: alice transferiu a empresa do bob';
  exception when sqlstate '42501' then null;
  end;

  -- membro de outro tenant como alvo: não encontrado na empresa da alice
  begin
    perform public.transfer_company_ownership(
      'c1c1c1c1-0000-4000-8000-000000000001',
      current_setting('rls.bob_member_id')::uuid);
    raise exception 'FALHA ownership: alice promoveu membro de outra empresa';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Privilégio mínimo: a matriz de GRANTs do client é exatamente esta. Tabela nova
-- exposta ao client precisa entrar aqui de propósito.
-- ---------------------------------------------------------------------------
do $$
declare
  diff text;
begin
  with expected (grantee, table_name, privilege_type) as (
    select 'anon', t, p from unnest(array['terms_versions']) t, unnest(array['SELECT']) p
    union all
    select 'authenticated', t, 'SELECT' from unnest(array[
      'roles', 'plans', 'terms_versions', 'platform_admins', 'profiles', 'companies',
      'audit_logs', 'terms_acceptances', 'user_consents', 'company_members',
      'company_invites', 'subscriptions', 'settings', 'reseller_settings', 'resellers',
      'commission_rules', 'reseller_clients', 'reseller_commissions', 'reseller_audit_log', 'reseller_referrals', 'reseller_commission_failures',
      'reseller_me', 'reseller_available_plans', 'reseller_my_clients', 'reseller_my_commissions']) t
    union all
    select 'authenticated', t, 'UPDATE' from unnest(array[
      'profiles', 'companies', 'company_members', 'company_invites', 'subscriptions', 'settings',
      'reseller_settings', 'resellers', 'commission_rules', 'reseller_clients', 'reseller_commissions']) t
    union all
    select 'authenticated', t, 'INSERT' from unnest(array[
      'audit_logs', 'terms_acceptances', 'user_consents', 'company_members',
      'company_invites', 'subscriptions', 'settings', 'resellers', 'commission_rules']) t
  ),
  actual as (
    select grantee::text, table_name::text, privilege_type::text
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
  ),
  differences as (
    (select 'sobrando: ' || a.grantee || ' ' || a.privilege_type || ' ' || a.table_name as line
     from actual a except select 'sobrando: ' || e.grantee || ' ' || e.privilege_type || ' ' || e.table_name from expected e)
    union all
    (select 'faltando: ' || e.grantee || ' ' || e.privilege_type || ' ' || e.table_name
     from expected e except select 'faltando: ' || a.grantee || ' ' || a.privilege_type || ' ' || a.table_name from actual a)
  )
  select string_agg(line, '; ') into diff from differences;
  if diff is not null then raise exception 'FALHA grants de tabela: %', diff; end if;

  -- anon lê plans só por colunas nomeadas, sem a flag de revenda.
  select string_agg(column_name, ', ' order by column_name) into diff
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'plans' and grantee = 'anon' and privilege_type = 'SELECT';
  if diff is distinct from 'billing_interval, code, created_at, currency, deleted_at, extra_seat_price_cents, features, id, is_active, name, price_cents, updated_at' then
    raise exception 'FALHA grants de coluna: anon em plans: %', diff;
  end if;

  -- anon não executa nenhuma função própria do schema public.
  select string_agg(p.oid::regprocedure::text, ', ') into diff
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and has_function_privilege('anon', p.oid, 'execute')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if diff is not null then raise exception 'FALHA grants de função: anon executa %', diff; end if;

  -- Trigger não é RPC: authenticated não chama diretamente.
  if has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') then
    raise exception 'FALHA grants de função: authenticated executa handle_new_user';
  end if;
end $$;

-- Objeto futuro nasce fechado para o client e aberto só ao service_role.
create table public.rls_test_default_acl (id int);
create function public.rls_test_default_fn() returns int language sql as 'select 1';
do $$
begin
  if has_table_privilege('anon', 'public.rls_test_default_acl', 'select')
    or has_table_privilege('authenticated', 'public.rls_test_default_acl', 'select') then
    raise exception 'FALHA default privileges: tabela nova nasce aberta ao client';
  end if;
  if has_table_privilege('service_role', 'public.rls_test_default_acl', 'truncate')
    or not has_table_privilege('service_role', 'public.rls_test_default_acl', 'select') then
    raise exception 'FALHA default privileges: service_role fora do esperado';
  end if;
  if has_function_privilege('anon', 'public.rls_test_default_fn()', 'execute')
    or has_function_privilege('authenticated', 'public.rls_test_default_fn()', 'execute') then
    raise exception 'FALHA default privileges: função nova nasce aberta ao client';
  end if;
end $$;
drop function public.rls_test_default_fn();
drop table public.rls_test_default_acl;

-- Reassinatura: o índice único barra a segunda assinatura até a anterior ir para o
-- histórico, que é o que billingService.applyPaymentEvent faz.
do $$
declare v_plan uuid;
begin
  select id into v_plan from public.plans where code = 'pro';
  begin
    insert into public.subscriptions (company_id, plan_id) values ('c2c2c2c2-0000-4000-8000-000000000002', v_plan);
    raise exception 'FALHA subscriptions: duas assinaturas ativas na mesma empresa';
  exception when unique_violation then null; -- esperado
  end;
  update public.subscriptions set deleted_at = now() where company_id = 'c2c2c2c2-0000-4000-8000-000000000002';
  insert into public.subscriptions (company_id, plan_id, status) values ('c2c2c2c2-0000-4000-8000-000000000002', v_plan, 'active');
end $$;

-- ---------------------------------------------------------------------------
-- platform_admins: ninguém se promove; cada um só enxerga a própria linha.
-- ---------------------------------------------------------------------------
insert into public.platform_admins (user_id) values ('b2b2b2b2-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  if public.is_super_admin() then raise exception 'FALHA platform_admins: alice virou super admin'; end if;

  select count(*) into n from public.platform_admins;
  if n <> 0 then raise exception 'FALHA platform_admins: alice viu a linha de outro usuário'; end if;

  begin
    insert into public.platform_admins (user_id) values ('a1a1a1a1-0000-4000-8000-000000000001');
    raise exception 'FALHA platform_admins: auto-promoção foi aceita';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);

do $$
begin
  if not public.is_super_admin() then raise exception 'FALHA platform_admins: bob não é super admin'; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Exclusão de usuário: FKs de autoria não podem impedir (LGPD, art. 18).
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  delete from auth.users where id = 'b2b2b2b2-0000-4000-8000-000000000002';

  select count(*) into n from public.profiles where id = 'b2b2b2b2-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA exclusão: profile do bob sobreviveu'; end if;

  select count(*) into n from public.companies
  where id = 'c2c2c2c2-0000-4000-8000-000000000002' and created_by is null;
  if n <> 1 then raise exception 'FALHA exclusão: companies.created_by não virou NULL'; end if;

  select count(*) into n from public.audit_logs
  where company_id = 'c2c2c2c2-0000-4000-8000-000000000002' and user_id is not null;
  if n <> 0 then raise exception 'FALHA exclusão: auditoria manteve o user_id do bob'; end if;
end $$;

rollback;

\echo 'RLS OK: todos os testes de isolamento multi-tenant passaram.'
