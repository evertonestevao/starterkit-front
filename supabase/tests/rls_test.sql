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
-- Domínio próprio: quem escreve `dominio_customizado` decide para onde vai o
-- tráfego daquele host. Estes testes provam que só o dono escreve, que o
-- client não consegue ativar um domínio sozinho e que o anon não lê os campos.
-- ---------------------------------------------------------------------------
insert into public.churches (id, company_id, name, slug, public_code) values
  ('d1d1d1d1-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Igreja Alice', 'rls-igreja-alice', 'rls-alice'),
  ('d2d2d2d2-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000002', 'Igreja Bob',   'rls-igreja-bob',   'rls-bob');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare
  v_status text;
begin
  -- Alice reivindica o domínio da PRÓPRIA igreja: permitido, entra pendente.
  perform public.claim_church_domain(
    'd1d1d1d1-0000-4000-8000-000000000001', 'alice-igreja.com.br');

  select dominio_status::text into v_status
  from public.churches where id = 'd1d1d1d1-0000-4000-8000-000000000001';
  if v_status <> 'pendente_dns' then
    raise exception 'FALHA dominio: claim deveria deixar pendente_dns, veio %', v_status;
  end if;

  -- Igreja de outro tenant: negado.
  begin
    perform public.claim_church_domain(
      'd2d2d2d2-0000-4000-8000-000000000002', 'roubado.com.br');
    raise exception 'FALHA dominio: alice reivindicou dominio da igreja do bob';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- Ativação a partir do client: negada mesmo na própria igreja. É o que
  -- impediria alguém de marcar `ativo` sem nunca provar posse do DNS.
  begin
    perform public.set_church_domain_verification(
      'd1d1d1d1-0000-4000-8000-000000000001', null, 'ativo');
    raise exception 'FALHA dominio: client conseguiu ativar dominio';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- Estado intermediário pelo client: permitido (é o fluxo normal).
  perform public.set_church_domain_verification(
    'd1d1d1d1-0000-4000-8000-000000000001', '[]'::jsonb, 'verificando');

  -- Limpar o próprio domínio: permitido.
  perform public.clear_church_domain('d1d1d1d1-0000-4000-8000-000000000001');
  select dominio_status::text into v_status
  from public.churches where id = 'd1d1d1d1-0000-4000-8000-000000000001';
  if v_status <> 'nao_configurado' then
    raise exception 'FALHA dominio: clear deveria voltar a nao_configurado, veio %', v_status;
  end if;

  -- Limpar o domínio de OUTRO tenant: negado.
  begin
    perform public.clear_church_domain('d2d2d2d2-0000-4000-8000-000000000002');
    raise exception 'FALHA dominio: alice limpou dominio da igreja do bob';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

-- UPDATE direto nas colunas de domínio: barrado pelo GRANT por coluna, antes
-- mesmo da RLS. Sem isso, um admin escreveria `ativo` pelo PostgREST.
do $$
begin
  begin
    update public.churches
    set dominio_status = 'ativo'
    where id = 'd1d1d1d1-0000-4000-8000-000000000001';
    raise exception 'FALHA dominio: UPDATE direto de dominio_status foi aceito';
  exception when sqlstate '42501' then null; -- esperado
  end;

  begin
    update public.churches
    set dominio_customizado = 'sequestro.com.br'
    where id = 'd1d1d1d1-0000-4000-8000-000000000001';
    raise exception 'FALHA dominio: UPDATE direto de dominio_customizado foi aceito';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- Coluna liberada segue editável pelo admin da empresa (não quebramos o CRUD).
  update public.churches
  set nome_proprio = 'Igreja Alice Renomeada'
  where id = 'd1d1d1d1-0000-4000-8000-000000000001';

  -- Mas não na igreja do outro tenant.
  update public.churches
  set nome_proprio = 'invadida'
  where id = 'd2d2d2d2-0000-4000-8000-000000000002';
  if found then
    raise exception 'FALHA dominio: alice renomeou a igreja do bob';
  end if;
end $$;

reset role;

-- Dois tenants não podem segurar o mesmo host.
do $$
begin
  update public.churches set dominio_customizado = 'disputado.com.br'
  where id = 'd1d1d1d1-0000-4000-8000-000000000001';
  begin
    update public.churches set dominio_customizado = 'disputado.com.br'
    where id = 'd2d2d2d2-0000-4000-8000-000000000002';
    raise exception 'FALHA dominio: dois tenants ficaram com o mesmo dominio';
  exception when unique_violation then null; -- esperado
  end;
end $$;

-- Igreja sem dono não existe mais: `company_id` virou NOT NULL na migration
-- 20260923100000, junto com a remoção das igrejas de demonstração. O CHECK
-- `churches_dominio_exige_dono` segue no banco como segunda tranca; aqui a
-- primeira já barra.
do $$
begin
  begin
    insert into public.churches (company_id, name, slug, public_code, dominio_customizado)
    values (null, 'Sem dono', 'rls-sem-dono', 'rls-sem-dono', 'semdono.com.br');
    raise exception 'FALHA dominio: igreja sem company_id foi criada';
  exception when not_null_violation or check_violation then null; -- esperado
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Visitante anônimo: lê a página pública, não lê os campos de domínio.
-- ---------------------------------------------------------------------------
update public.churches
set dominio_customizado = 'alice-igreja.com.br', dominio_status = 'ativo'
where id = 'd1d1d1d1-0000-4000-8000-000000000001';

update public.churches
set dominio_customizado = 'bob-igreja.com.br', dominio_status = 'pendente_dns'
where id = 'd2d2d2d2-0000-4000-8000-000000000002';

set local role anon;

do $$
declare
  v_code text;
  n int;
begin
  -- Colunas públicas: visíveis.
  select public_code into v_code
  from public.churches where id = 'd1d1d1d1-0000-4000-8000-000000000001';
  if v_code is null then
    raise exception 'FALHA dominio: anon nao le a pagina publica da igreja';
  end if;

  -- Colunas de domínio: barradas pelo GRANT por coluna.
  begin
    select count(*) into n from public.churches where dominio_customizado is not null;
    raise exception 'FALHA dominio: anon leu dominio_customizado';
  exception when sqlstate '42501' then null; -- esperado
  end;

  begin
    select count(*) into n from public.churches where dominio_suporte_pago;
    raise exception 'FALHA dominio: anon leu dominio_suporte_pago';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- A RPC do proxy resolve só domínio ATIVO, e devolve o mínimo.
  select count(*) into n from public.resolve_church_by_domain('alice-igreja.com.br');
  if n <> 1 then
    raise exception 'FALHA dominio: RPC nao resolveu dominio ativo (%)', n;
  end if;

  select count(*) into n from public.resolve_church_by_domain('bob-igreja.com.br');
  if n <> 0 then
    raise exception 'FALHA dominio: RPC resolveu dominio ainda PENDENTE';
  end if;

  select count(*) into n from public.resolve_church_by_domain('inexistente.com.br');
  if n <> 0 then
    raise exception 'FALHA dominio: RPC resolveu dominio inexistente';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Patrocínio: cada patrocinador só vê e mexe no que é dele; status, valores
-- e cobranças não são graváveis pelo client; a igreja só lê o próprio.
-- (Reaproveita as igrejas d1 = Alice Co e d2 = Bob Co da seção de domínio.)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('e3e3e3e3-0000-4000-8000-000000000003', 'rls-carol@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Carol Patrocinadora"}'),
  ('f4f4f4f4-0000-4000-8000-000000000004', 'rls-dave@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Dave Patrocinador"}');

-- Dave é montado direto (superuser): conta, patrocínio ativo na d2, cobrança.
insert into public.sponsor_accounts (id, user_id, kind, display_name, email, document, gateway, gateway_customer_id, gateway_subscription_id, billing_status)
values ('a0000000-0000-4000-8000-00000000000d', 'f4f4f4f4-0000-4000-8000-000000000004', 'person', 'Dave', 'rls-dave@test.local', '52998224725', 'fake', 'cus_dave', 'sub_dave', 'active');

insert into public.sponsorships (id, sponsor_id, church_id, company_id, status, activated_at)
values ('b0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-00000000000d', 'd2d2d2d2-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000002', 'active', now());

insert into public.sponsor_charges (id, sponsor_id, gateway, gateway_payment_id, amount_cents, active_count, due_date, status)
values ('c0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-00000000000d', 'fake', 'pay_dave', 3990, 1, current_date, 'paid');

insert into public.sponsor_charge_items (charge_id, sponsorship_id, church_id, company_id, position, amount_cents)
values ('c0000000-0000-4000-8000-00000000000d', 'b0000000-0000-4000-8000-00000000000d', 'd2d2d2d2-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000002', 1, 3990);

-- Igreja EXCLUÍDA, para provar que não recebe patrocínio pago. (Antes esta
-- fixture era uma igreja sem dono; `company_id` virou NOT NULL na migration
-- 20260923100000 e esse estado deixou de existir.)
insert into public.churches (id, company_id, name, slug, public_code, deleted_at)
values ('d9d9d9d9-0000-4000-8000-000000000009', 'c2c2c2c2-0000-4000-8000-000000000002',
        'Igreja Excluida RLS', 'rls-igreja-demo', 'rls-demo', now());

-- ---------------------------- sessão da CAROL -----------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e3e3e3e3-0000-4000-8000-000000000003","email":"rls-carol@test.local","role":"authenticated"}', true);

do $$
declare
  n int;
  v_row public.sponsorships;
begin
  -- Cria a PRÓPRIA conta: permitido.
  insert into public.sponsor_accounts (user_id, kind, display_name, email, document)
  values ('e3e3e3e3-0000-4000-8000-000000000003', 'person', 'Carol', 'rls-carol@test.local', '52998224725');

  -- Conta em nome de outro usuário: barrado pela policy.
  begin
    insert into public.sponsor_accounts (user_id, kind, display_name, email, document)
    values ('b2b2b2b2-0000-4000-8000-000000000002', 'person', 'Falso Bob', 'x@x', '52998224725');
    raise exception 'FALHA sponsor: carol criou conta em nome de outro usuario';
  exception when sqlstate '42501' then null;
  end;

  -- Só enxerga a própria conta.
  select count(*) into n from public.sponsor_accounts;
  if n <> 1 then raise exception 'FALHA sponsor: carol ve % contas (esperado 1)', n; end if;

  -- Campos de cobrança não são graváveis pelo client.
  begin
    update public.sponsor_accounts set billing_status = 'active'
    where user_id = 'e3e3e3e3-0000-4000-8000-000000000003';
    raise exception 'FALHA sponsor: carol mudou o proprio billing_status';
  exception when sqlstate '42501' then null;
  end;

  begin
    update public.sponsor_accounts set gateway_subscription_id = 'sub_dave'
    where user_id = 'e3e3e3e3-0000-4000-8000-000000000003';
    raise exception 'FALHA sponsor: carol gravou id de assinatura';
  exception when sqlstate '42501' then null;
  end;

  -- Nome exibido deixou de ser editável pelo dono (migration 20260918120000):
  -- ele aparece na página pública da igreja e agora passa pela moderação.
  begin
    update public.sponsor_accounts set display_name = 'Carol S.'
    where user_id = 'e3e3e3e3-0000-4000-8000-000000000003';
    raise exception 'FALHA sponsor: carol escreveu display_name direto';
  exception when sqlstate '42501' then null;
  end;

  -- Telefone, que não aparece em página nenhuma, segue editável.
  update public.sponsor_accounts set phone = '11988887777'
  where user_id = 'e3e3e3e3-0000-4000-8000-000000000003';

  -- Pedido via RPC: sem cobrança ativa, nasce aguardando pagamento.
  select * into v_row from public.request_sponsorship('d1d1d1d1-0000-4000-8000-000000000001');
  if v_row.status <> 'pending_payment' then
    raise exception 'FALHA sponsor: status inicial % (esperado pending_payment)', v_row.status;
  end if;

  -- Duplicado para a mesma igreja: barrado pelo índice único.
  begin
    perform public.request_sponsorship('d1d1d1d1-0000-4000-8000-000000000001');
    raise exception 'FALHA sponsor: patrocinio duplicado aceito';
  exception when unique_violation then null;
  end;

  -- Igreja excluída não recebe patrocínio pago.
  begin
    perform public.request_sponsorship('d9d9d9d9-0000-4000-8000-000000000009');
    raise exception 'FALHA sponsor: igreja excluida aceitou patrocinio';
  exception when sqlstate 'P0002' or no_data_found then null;
  end;

  -- Escrita direta em patrocínio/cobrança: sem GRANT.
  begin
    insert into public.sponsorships (sponsor_id, church_id, company_id, status, activated_at)
    select id, 'd2d2d2d2-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000002', 'active', now()
    from public.sponsor_accounts limit 1;
    raise exception 'FALHA sponsor: insert direto em sponsorships aceito';
  exception when sqlstate '42501' then null;
  end;

  begin
    update public.sponsorships set status = 'active', activated_at = now();
    raise exception 'FALHA sponsor: update direto em sponsorships aceito';
  exception when sqlstate '42501' then null;
  end;

  begin
    insert into public.sponsor_charges (sponsor_id, gateway, gateway_payment_id, amount_cents, active_count, due_date, status)
    select id, 'fake', 'forjado', 0, 0, current_date, 'paid' from public.sponsor_accounts limit 1;
    raise exception 'FALHA sponsor: carol forjou cobranca paga';
  exception when sqlstate '42501' then null;
  end;

  -- Isolamento de leitura: nada do Dave aparece.
  select count(*) into n from public.sponsorships;
  if n <> 1 then raise exception 'FALHA sponsor: carol ve % patrocinios (esperado 1)', n; end if;
  select count(*) into n from public.sponsor_charges;
  if n <> 0 then raise exception 'FALHA sponsor: carol ve cobranca alheia'; end if;
  select count(*) into n from public.sponsor_charge_items;
  if n <> 0 then raise exception 'FALHA sponsor: carol ve itens de cobranca alheios'; end if;

  -- Cancelar patrocínio do Dave: não encontrado.
  begin
    perform public.cancel_sponsorship('b0000000-0000-4000-8000-00000000000d');
    raise exception 'FALHA sponsor: carol cancelou patrocinio do dave';
  exception when sqlstate 'P0002' then null;
  end;

  -- Tabela de preços é legível; escrita não.
  select count(*) into n from public.sponsor_price_tiers;
  if n < 1 then raise exception 'FALHA sponsor: tabela de precos ilegivel'; end if;
  begin
    update public.sponsor_price_tiers set amount_cents = 1;
    raise exception 'FALHA sponsor: carol alterou tabela de precos';
  exception when sqlstate '42501' then null;
  end;
end $$;

reset role;

-- Cobrança da Carol confirmada (como faria o webhook): ativa e com cobrança.
update public.sponsor_accounts
set gateway = 'fake', gateway_customer_id = 'cus_carol', gateway_subscription_id = 'sub_carol',
    billing_status = 'active', next_due_date = current_date + 30
where user_id = 'e3e3e3e3-0000-4000-8000-000000000003';

update public.sponsorships s
set status = 'active', activated_at = now()
from public.sponsor_accounts sa
where sa.id = s.sponsor_id and sa.user_id = 'e3e3e3e3-0000-4000-8000-000000000003';

-- ------------------------ admin da igreja (ALICE) --------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- Vê quem patrocina a PRÓPRIA igreja (d1), não a do Bob (d2).
  select count(*) into n from public.sponsorships where company_id = 'c1c1c1c1-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'FALHA sponsor: alice ve % patrocinios da propria igreja', n; end if;
  select count(*) into n from public.sponsorships where company_id = 'c2c2c2c2-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA sponsor: alice ve patrocinio de outra igreja'; end if;

  -- Não vê a conta nem as cobranças do patrocinador (CPF, gateway, valores).
  select count(*) into n from public.sponsor_accounts;
  if n <> 0 then raise exception 'FALHA sponsor: alice ve conta de patrocinador'; end if;
  select count(*) into n from public.sponsor_charges;
  if n <> 0 then raise exception 'FALHA sponsor: alice ve cobranca de patrocinador'; end if;
  -- Itens da cobrança do Dave são da igreja do Bob: invisíveis para Alice.
  select count(*) into n from public.sponsor_charge_items;
  if n <> 0 then raise exception 'FALHA sponsor: alice ve itens de outra igreja'; end if;
end $$;

reset role;

-- ------------------------------- anônimo ----------------------------------
set local role anon;

do $$
declare
  n int;
  v_name text;
begin
  select count(*), max(display_name) into n, v_name
  from public.list_church_sponsors('d1d1d1d1-0000-4000-8000-000000000001');
  -- 'Carol' e o nome do cadastro: trocar o nome exibido agora depende da
  -- moderacao, entao a vitrine segue mostrando o que foi aprovado.
  if n <> 1 or v_name <> 'Carol' then
    raise exception 'FALHA sponsor: vitrine publica devolveu % linhas (%)', n, v_name;
  end if;

  begin
    select count(*) into n from public.sponsor_accounts;
    raise exception 'FALHA sponsor: anon leu sponsor_accounts';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform public.request_sponsorship('d1d1d1d1-0000-4000-8000-000000000001');
    raise exception 'FALHA sponsor: anon pediu patrocinio';
  exception when sqlstate '42501' then null;
  end;
end $$;

reset role;

-- ------------------- CAROL: cancelar e pagamento atrasado ------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e3e3e3e3-0000-4000-8000-000000000003","email":"rls-carol@test.local","role":"authenticated"}', true);

do $$
declare
  v_row public.sponsorships;
  v_id uuid;
begin
  select id into v_id from public.sponsorships limit 1;
  select * into v_row from public.cancel_sponsorship(v_id);
  if v_row.status <> 'cancel_scheduled' or v_row.ends_at is null then
    raise exception 'FALHA sponsor: cancelamento de ativo virou % / %', v_row.status, v_row.ends_at;
  end if;
end $$;

reset role;

update public.sponsor_accounts set billing_status = 'overdue'
where user_id = 'e3e3e3e3-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e3e3e3e3-0000-4000-8000-000000000003","email":"rls-carol@test.local","role":"authenticated"}', true);

do $$
begin
  begin
    perform public.request_sponsorship('d2d2d2d2-0000-4000-8000-000000000002');
    raise exception 'FALHA sponsor: patrocinio novo aceito com pagamento atrasado';
  exception when check_violation then null;
  end;
end $$;

reset role;

-- Cancelamento agendado segue na vitrine até o fim do ciclo.
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.list_church_sponsors('d1d1d1d1-0000-4000-8000-000000000001');
  if n <> 1 then raise exception 'FALHA sponsor: cancelamento agendado sumiu da vitrine antes da hora'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Onboarding: criar empresa cria a IGREJA junto (senão não há página pública,
-- QR Code, domínio próprio nem link de patrocínio).
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare
  v_company public.companies;
  v_church public.churches;
  v_second public.companies;
  v_codes text[];
begin
  v_company := public.create_company_with_church('Igreja Nova RLS', 'rls-igreja-nova');

  select * into v_church from public.churches where company_id = v_company.id;
  if v_church.id is null then
    raise exception 'FALHA onboarding: empresa criada SEM igreja';
  end if;
  if v_church.name <> 'Igreja Nova RLS' then
    raise exception 'FALHA onboarding: igreja com nome errado (%)', v_church.name;
  end if;
  if v_church.public_code is null or v_church.path is null then
    raise exception 'FALHA onboarding: igreja sem public_code/path';
  end if;

  -- O criador precisa ser owner, senão não administra a própria igreja.
  if not public.is_company_owner(v_company.id) then
    raise exception 'FALHA onboarding: criador nao virou owner';
  end if;

  -- Mesmo nome duas vezes não pode colidir no endereço público (único global).
  v_second := public.create_company_with_church('Igreja Nova RLS', 'rls-igreja-nova-2');
  select array_agg(public_code) into v_codes
  from public.churches where company_id in (v_company.id, v_second.id);
  if v_codes[1] = v_codes[2] then
    raise exception 'FALHA onboarding: duas igrejas com o mesmo public_code (%)', v_codes[1];
  end if;

  -- E a igreja nova já aceita patrocínio (tem dono).
  perform 1 from public.churches where id = v_church.id and company_id is not null;
end $$;

reset role;

-- Anônimo não cria empresa/igreja.
set local role anon;
do $$
begin
  begin
    perform public.create_company_with_church('Igreja Anonima', 'rls-anon');
    raise exception 'FALHA onboarding: anon criou empresa';
  exception when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- Cadastro: complemento do nome e "faz parte de uma rede". A declaração nasce
-- pela RPC; o client não a reescreve depois e o anônimo não a lê. O bloco todo
-- é desfeito no fim (subtransação), para não mudar a contagem de igrejas dos
-- testes seguintes.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare
  v_company public.companies;
  v_church public.churches;
begin
  begin
    v_company := public.create_company_with_church(
      'Igreja Rede RLS', 'rls-igreja-rede', '  Prainha - Promissão ', true, ' Ministério do Belém ');
    select * into v_church from public.churches where company_id = v_company.id;
    if v_church.sobrenome is distinct from 'Prainha - Promissão' then
      raise exception 'FALHA cadastro: sobrenome nao gravado/aparado (%)', v_church.sobrenome;
    end if;
    if not v_church.faz_parte_de_rede or v_church.rede_nome is distinct from 'Ministério do Belém' then
      raise exception 'FALHA cadastro: rede nao gravada (%, %)', v_church.faz_parte_de_rede, v_church.rede_nome;
    end if;

    -- Nome de rede sem marcar que faz parte de uma é descartado, não gravado torto.
    v_company := public.create_company_with_church(
      'Igreja Sem Rede RLS', 'rls-igreja-sem-rede', null, false, 'Rede Fantasma');
    select * into v_church from public.churches where company_id = v_company.id;
    if v_church.faz_parte_de_rede or v_church.rede_nome is not null or v_church.sobrenome is not null then
      raise exception 'FALHA cadastro: igreja sem rede ficou com dado de rede';
    end if;

    -- O dono da igreja não reescreve a declaração pelo client (só a RPC grava).
    begin
      update public.churches set faz_parte_de_rede = true, rede_nome = 'Outra' where id = v_church.id;
      raise exception 'FALHA cadastro: authenticated alterou a rede da igreja';
    exception when sqlstate '42501' then null;
    end;

    -- Nome longo (slug de 50) e nome curtíssimo (slug de 2) precisam gerar um
    -- endereço público válido (3 a 40 caracteres), e o desempate não estoura 40.
    v_company := public.create_company_with_church(
      'Igreja Longa RLS', 'rls-assembleia-de-deus-ministerio-no-ipiranga-zona-sul');
    select * into v_church from public.churches where company_id = v_company.id;
    if char_length(v_church.public_code) not between 3 and 40 then
      raise exception 'FALHA cadastro: public_code de nome longo fora de 3-40 (%)', v_church.public_code;
    end if;
    v_company := public.create_company_with_church(
      'Igreja Longa RLS', 'rls-assembleia-de-deus-ministerio-no-ipiranga-zona-sul-2');
    select * into v_church from public.churches where company_id = v_company.id;
    if char_length(v_church.public_code) not between 3 and 40 or v_church.public_code ~ '-$' then
      raise exception 'FALHA cadastro: public_code de desempate invalido (%)', v_church.public_code;
    end if;
    v_company := public.create_company_with_church('Ab', 'ab');
    select * into v_church from public.churches where company_id = v_company.id;
    if char_length(v_church.public_code) not between 3 and 40 then
      raise exception 'FALHA cadastro: public_code de nome curto fora de 3-40 (%)', v_church.public_code;
    end if;

    raise exception 'ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'ROLLBACK_OK' then
      raise;
    end if;
  end;
end $$;

reset role;

-- Página pública (anon) não enxerga a rede declarada.
set local role anon;
do $$
begin
  begin
    perform rede_nome from public.churches limit 1;
    raise exception 'FALHA cadastro: anon leu rede_nome';
  exception when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Patrocinadores vistos PELA IGREJA: só os dela, e sem dado pessoal.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare
  n int;
  v_nome text;
begin
  -- Carol patrocina a igreja da Alice (ativo, vindo da secao anterior).
  select count(*), max(sponsor_name) into n, v_nome
  from public.list_company_sponsors('c1c1c1c1-0000-4000-8000-000000000001');
  if n <> 1 then
    raise exception 'FALHA patrocinadores: alice ve % patrocinadores (esperado 1)', n;
  end if;
  if v_nome is null then
    raise exception 'FALHA patrocinadores: nome do patrocinador nao veio';
  end if;

  -- A empresa do Bob tem o patrocinio do Dave: Alice nao pode consultar.
  begin
    perform public.list_company_sponsors('c2c2c2c2-0000-4000-8000-000000000002');
    raise exception 'FALHA patrocinadores: alice consultou patrocinadores de outra empresa';
  exception when sqlstate '42501' then null;
  end;

  -- E segue sem acesso a tabela de contas (CPF, email, ids do gateway).
  select count(*) into n from public.sponsor_accounts;
  if n <> 0 then raise exception 'FALHA patrocinadores: alice le sponsor_accounts'; end if;
end $$;

reset role;

-- Anonimo nao consulta patrocinadores de empresa nenhuma.
set local role anon;
do $$
begin
  begin
    perform public.list_company_sponsors('c1c1c1c1-0000-4000-8000-000000000001');
    raise exception 'FALHA patrocinadores: anon consultou a lista';
  exception when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Caixa de entrada da comunidade: a igreja LÊ o que chega pela página
-- pública, e só o que é dela. O company_id vem do trigger, nunca do cliente.
-- ---------------------------------------------------------------------------
-- Anônimo envia para a igreja da Alice e para a do Bob. A inscrição em
-- evento só existe pela função sign_up_for_event (migration 20260919220000),
-- então a igreja do Bob precisa de um evento publicado.
insert into public.church_events (id, church_id, titulo, inicio)
values ('e1e1e1e1-0000-4000-8000-000000000001', 'd2d2d2d2-0000-4000-8000-000000000002',
        'Retiro', now() + interval '20 days');

set local role anon;
do $$
begin
  -- company_id enviado de propósito ERRADO (empresa do Bob): o trigger tem
  -- que sobrescrever pela empresa dona da igreja.
  insert into public.prayer_requests (church_id, company_id, name, message)
  values ('d1d1d1d1-0000-4000-8000-000000000001', 'c2c2c2c2-0000-4000-8000-000000000002', 'Visitante', 'Orem por mim');

  insert into public.visitors (church_id, name, contact)
  values ('d1d1d1d1-0000-4000-8000-000000000001', 'Maria', '14999990000');

  perform public.sign_up_for_event('e1e1e1e1-0000-4000-8000-000000000001', 'Joao', '11988887777');

  -- Anônimo NÃO lê o que a comunidade enviou.
  begin
    perform 1 from public.prayer_requests;
    raise exception 'FALHA inbox: anon leu pedidos de oracao';
  exception when sqlstate '42501' then null;
  end;
end $$;
reset role;

do $$
declare v_company uuid;
begin
  select company_id into v_company from public.prayer_requests
  where church_id = 'd1d1d1d1-0000-4000-8000-000000000001';
  if v_company <> 'c1c1c1c1-0000-4000-8000-000000000001' then
    raise exception 'FALHA inbox: trigger aceitou company_id do cliente (%)', v_company;
  end if;
end $$;

-- ALICE (owner da empresa 1) enxerga só o que é da igreja dela.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.prayer_requests;
  if n <> 1 then raise exception 'FALHA inbox: alice ve % pedidos (esperado 1)', n; end if;

  select count(*) into n from public.visitors;
  if n <> 1 then raise exception 'FALHA inbox: alice ve % visitantes (esperado 1)', n; end if;

  -- A inscrição foi na igreja do Bob: invisível para a Alice.
  select count(*) into n from public.event_signups;
  if n <> 0 then raise exception 'FALHA inbox: alice ve inscricao de outra igreja'; end if;

  -- Registro do que a comunidade enviou não se edita nem se apaga.
  begin
    update public.prayer_requests set message = 'alterado';
    raise exception 'FALHA inbox: UPDATE aceito em pedido de oracao';
  exception when sqlstate '42501' then null;
  end;
  begin
    delete from public.visitors;
    raise exception 'FALHA inbox: DELETE aceito em visitantes';
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
-- Moderação do perfil do patrocinador (migration 20260918120000).
--
-- O que está sendo provado: o dono da conta NÃO escreve mais direto nas duas
-- colunas que aparecem na página pública da igreja, e a fila da moderação só
-- existe para quem é staff da plataforma.
-- ---------------------------------------------------------------------------
reset role;

insert into public.sponsor_accounts (id, user_id, kind, display_name, email, document) values
  ('5a5a5a5a-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001',
   'business', 'Padaria da Alice', 'rls-alice@test.local', '52998224725'),
  ('5b5b5b5b-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-000000000002',
   'business', 'Mercado do Bob', 'rls-bob@test.local', '11144477735');

-- Ids fixos: a consulta que buscaria o id do pedido do Bob rodaria sob RLS,
-- e a moderadora nao enxerga a LINHA dele (so a fila, pela RPC).
insert into public.sponsor_profile_changes
  (id, sponsor_account_id, novo_display_name, anterior_display_name, cancel_token_hash, token_expira_em)
values
  ('c0c0c0c0-0000-4000-8000-00000000000a', '5a5a5a5a-0000-4000-8000-000000000001',
   'Padaria Nova', 'Padaria da Alice', 'hash-alice', now() + interval '30 days'),
  ('c0c0c0c0-0000-4000-8000-00000000000b', '5b5b5b5b-0000-4000-8000-000000000002',
   'Mercado Novo', 'Mercado do Bob', 'hash-bob', now() + interval '30 days');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int; ok boolean;
begin
  -- Vê o próprio pedido, não o do outro patrocinador.
  select count(*) into n from public.sponsor_profile_changes;
  if n <> 1 then
    raise exception 'FALHA sponsor_profile_changes: esperado 1 pedido (o proprio), veio %', n;
  end if;

  -- O buraco que a migration fechou: nome exibido é escrita de moderação.
  begin
    update public.sponsor_accounts set display_name = 'Invadido'
    where id = '5a5a5a5a-0000-4000-8000-000000000001';
    raise exception 'FALHA sponsor_accounts: dono ainda escreve display_name direto';
  exception when sqlstate '42501' then null; -- esperado
  end;

  begin
    update public.sponsor_accounts set logo_url = 'https://malicioso.example/x.png'
    where id = '5a5a5a5a-0000-4000-8000-000000000001';
    raise exception 'FALHA sponsor_accounts: dono ainda escreve logo_url direto';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- Telefone não aparece em página nenhuma: segue editável pelo dono.
  update public.sponsor_accounts set phone = '11999999999'
  where id = '5a5a5a5a-0000-4000-8000-000000000001';

  -- Não é staff: não enxerga a fila nem decide nada.
  if public.is_platform_staff() then
    raise exception 'FALHA is_platform_staff: usuario comum apareceu como staff';
  end if;

  select count(*) into n from public.list_pending_profile_changes();
  if n <> 0 then
    raise exception 'FALHA list_pending_profile_changes: vazou % linha(s) para nao-staff', n;
  end if;

  begin
    select public.review_profile_change('c0c0c0c0-0000-4000-8000-00000000000a', true) into ok;
    raise exception 'FALHA review_profile_change: nao-staff aprovou alteracao';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- platform_staff não é legível por quem não é staff.
  begin
    select count(*) into n from public.platform_staff;
    raise exception 'FALHA platform_staff: tabela legivel por authenticated';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

-- ---------------------------------------------------------------------------
-- A MESMA usuária, agora como moderação: a fila abre e a decisão aplica.
-- ---------------------------------------------------------------------------
reset role;

insert into public.platform_staff (user_id, email)
values ('a1a1a1a1-0000-4000-8000-000000000001', 'rls-alice@test.local');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int; ok boolean;
begin
  if not public.is_platform_staff() then
    raise exception 'FALHA is_platform_staff: staff cadastrado nao foi reconhecido';
  end if;

  -- A fila atravessa tenants de propósito: é o trabalho da moderação.
  -- Conta só as contas DESTE teste: o banco pode ter outras filas (staging).
  select count(*) into n from public.list_pending_profile_changes()
  where sponsor_account_id in ('5a5a5a5a-0000-4000-8000-000000000001',
                               '5b5b5b5b-0000-4000-8000-000000000002');
  if n <> 2 then
    raise exception 'FALHA list_pending_profile_changes: esperado 2, veio %', n;
  end if;

  -- Aprovar é o ÚNICO caminho que muda o nome público.
  select public.review_profile_change('c0c0c0c0-0000-4000-8000-00000000000b', true) into ok;
  if not ok then raise exception 'FALHA review_profile_change: aprovacao nao aplicou'; end if;
end $$;

-- O efeito é conferido FORA do bloco, como superuser. Dentro dele a leitura
-- cairia na RLS e voltaria NULL — e `NULL <> 'x'` é NULL, ou seja, o teste
-- passaria sem ter verificado nada.
reset role;

do $$
declare n int; nome text;
begin
  select display_name into nome from public.sponsor_accounts
  where id = '5b5b5b5b-0000-4000-8000-000000000002';
  if nome is distinct from 'Mercado Novo' then
    raise exception 'FALHA review_profile_change: nome publico ficou %', coalesce(nome, '<null>');
  end if;

  select count(*) into n from public.platform_staff_actions
  where action = 'sponsor_profile.aprovada'
    and entity_id = 'c0c0c0c0-0000-4000-8000-00000000000b';
  if n <> 1 then
    raise exception 'FALHA platform_staff_actions: decisao nao foi auditada (% linhas)', n;
  end if;
end $$;

-- Recusa sem motivo é barrada no banco, não só na tela.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare ok boolean;
begin
  begin
    select public.review_profile_change('c0c0c0c0-0000-4000-8000-00000000000a', false, null) into ok;
    raise exception 'FALHA review_profile_change: recusa sem motivo foi aceita';
  exception when sqlstate 'P0001' then null; -- esperado
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Link do patrocinador (migration 20260926100000).
--
-- O link leva quem clica para fora da plataforma a partir de uma página
-- pública: tem o mesmo tratamento do nome e do logo. O que está sendo provado:
-- o dono da conta não escreve o link direto, o banco só aceita http(s)/número
-- de WhatsApp, só a moderação publica, a vitrine devolve o link aprovado e o
-- "não fui eu" desfaz o link.
-- ---------------------------------------------------------------------------
reset role;

-- O CHECK vale até para quem tem service_role: nada de javascript: no banco.
do $$
begin
  begin
    update public.sponsor_accounts
    set link_tipo = 'link', link_valor = 'javascript:alert(1)'
    where id = '5a5a5a5a-0000-4000-8000-000000000001';
    raise exception 'FALHA sponsor_accounts: aceitou link javascript:';
  exception when check_violation then null; -- esperado
  end;

  begin
    update public.sponsor_accounts
    set link_tipo = 'whatsapp', link_valor = '(11) 91234-5678'
    where id = '5a5a5a5a-0000-4000-8000-000000000001';
    raise exception 'FALHA sponsor_accounts: aceitou WhatsApp fora do formato';
  exception when check_violation then null; -- esperado
  end;

  begin
    insert into public.sponsor_profile_changes
      (sponsor_account_id, anterior_display_name, cancel_token_hash, token_expira_em,
       novo_link_alterado, novo_link_tipo, novo_link_valor)
    values ('5a5a5a5a-0000-4000-8000-000000000001', 'Padaria da Alice', 'hash-js', now() + interval '30 days',
            true, 'link', 'javascript:alert(1)');
    raise exception 'FALHA sponsor_profile_changes: aceitou pedido com link javascript:';
  exception when check_violation then null; -- esperado
  end;
end $$;

-- Pedido de link do Bob (a conta dele nao tem pendente: o de nome ja foi aprovado).
insert into public.sponsor_profile_changes
  (id, sponsor_account_id, anterior_display_name, cancel_token_hash, token_expira_em,
   novo_link_alterado, novo_link_tipo, novo_link_valor)
values
  ('c0c0c0c0-0000-4000-8000-00000000000c', '5b5b5b5b-0000-4000-8000-000000000002',
   'Mercado Novo', 'hash-bob-link', now() + interval '30 days',
   true, 'whatsapp', '5511912345678');

-- Dono da conta (Alice, patrocinadora 5a): nao escreve o link direto.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
begin
  begin
    update public.sponsor_accounts set link_tipo = 'link', link_valor = 'https://malicioso.example/'
    where id = '5a5a5a5a-0000-4000-8000-000000000001';
    raise exception 'FALHA sponsor_accounts: dono ainda escreve o link direto';
  exception when sqlstate '42501' then null; -- esperado
  end;

  begin
    update public.sponsor_accounts set link_valor = null
    where id = '5a5a5a5a-0000-4000-8000-000000000001';
    raise exception 'FALHA sponsor_accounts: dono ainda escreve link_valor direto';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

-- Como moderacao (Alice tambem e staff), aprovar e o unico caminho que publica.
do $$
declare ok boolean;
begin
  select public.review_profile_change('c0c0c0c0-0000-4000-8000-00000000000c', true) into ok;
  if not ok then raise exception 'FALHA review_profile_change: aprovacao do link nao aplicou'; end if;
end $$;

reset role;

do $$
declare tipo text; valor text; nome text;
begin
  select link_tipo, link_valor, display_name into tipo, valor, nome
  from public.sponsor_accounts where id = '5b5b5b5b-0000-4000-8000-000000000002';
  if tipo is distinct from 'whatsapp' or valor is distinct from '5511912345678' then
    raise exception 'FALHA review_profile_change: link publico ficou %/%', coalesce(tipo, '<null>'), coalesce(valor, '<null>');
  end if;
  -- Pedido so de link nao mexe no nome.
  if nome is distinct from 'Mercado Novo' then
    raise exception 'FALHA review_profile_change: pedido de link alterou o nome (%)', nome;
  end if;
end $$;

-- A vitrine publica (anon) devolve o link aprovado da conta do patrocinador.
update public.sponsor_accounts
set link_tipo = 'link', link_valor = 'https://loja-do-dave.example/'
where id = 'a0000000-0000-4000-8000-00000000000d';

set local role anon;

do $$
declare n int; tipo text; valor text;
begin
  select count(*), max(link_tipo), max(link_valor) into n, tipo, valor
  from public.list_church_sponsors('d2d2d2d2-0000-4000-8000-000000000002');
  if n <> 1 or tipo is distinct from 'link' or valor is distinct from 'https://loja-do-dave.example/' then
    raise exception 'FALHA vitrine: link nao veio na vitrine publica (% linhas, %/%)', n, tipo, valor;
  end if;
end $$;

-- "Nao fui eu" (sem sessao): desfaz o link ja aprovado e tranca a conta.
do $$
declare ok boolean;
begin
  select public.cancel_profile_change_by_token('hash-bob-link') into ok;
  if not ok then raise exception 'FALHA cancel_profile_change_by_token: nao desfez o pedido do link'; end if;
end $$;

reset role;

do $$
declare tipo text; valor text;
begin
  select link_tipo, link_valor into tipo, valor
  from public.sponsor_accounts where id = '5b5b5b5b-0000-4000-8000-000000000002';
  if tipo is not null or valor is not null then
    raise exception 'FALHA cancel_profile_change_by_token: link continuou publicado (%/%)', tipo, valor;
  end if;
end $$;

-- Destrava a conta e limpa o link do Dave: o que segue nao depende disto.
update public.sponsor_accounts set security_hold_at = null
where id = '5b5b5b5b-0000-4000-8000-000000000002';
update public.sponsor_accounts set link_tipo = null, link_valor = null
where id = 'a0000000-0000-4000-8000-00000000000d';

-- ---------------------------------------------------------------------------
-- Esconder patrocinador e denunciar (migration 20260918140000).
--
-- Esconder é decisão SÓ da igreja e tira a marca da vitrine pública sem tocar
-- na cobrança. Denunciar é o contrário: manda o caso para a plataforma.
-- ---------------------------------------------------------------------------
reset role;

-- Bob é owner da empresa que tem a Igreja Bob, patrocinada pelo Dave.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);

do $$
declare n int; ok boolean; v_id uuid;
begin
  -- Antes: Dave aparece na vitrine da igreja do Bob.
  select count(*) into n
  from public.list_church_sponsors('d2d2d2d2-0000-4000-8000-000000000002');
  if n <> 1 then raise exception 'FALHA vitrine: esperado 1 patrocinador, veio %', n; end if;

  select public.set_sponsorship_hidden(
    'b0000000-0000-4000-8000-00000000000d', true, 'nao combina com a igreja') into ok;

  select count(*) into n
  from public.list_church_sponsors('d2d2d2d2-0000-4000-8000-000000000002');
  if n <> 0 then raise exception 'FALHA esconder: patrocinador seguiu na vitrine (%)', n; end if;

  -- Esconder não cancela nada: a cobrança do patrocinador continua.
  select count(*) into n from public.sponsorships
  where id = 'b0000000-0000-4000-8000-00000000000d' and status = 'active';
  if n <> 1 then raise exception 'FALHA esconder: mexeu no status do patrocinio'; end if;

  -- Volta a aparecer.
  select public.set_sponsorship_hidden('b0000000-0000-4000-8000-00000000000d', false) into ok;
  select count(*) into n
  from public.list_church_sponsors('d2d2d2d2-0000-4000-8000-000000000002');
  if n <> 1 then raise exception 'FALHA reexibir: patrocinador nao voltou'; end if;

  -- Denúncia: insistir não gera fila dupla.
  select public.report_sponsor_abuse(
    'b0000000-0000-4000-8000-00000000000d', 'logo com conteudo impróprio') into v_id;
  if v_id is null then raise exception 'FALHA denuncia: nao registrou'; end if;

  select count(*) into n from public.sponsor_abuse_reports
  where status = 'aberta' and sponsorship_id = 'b0000000-0000-4000-8000-00000000000d';
  if n <> 1 then raise exception 'FALHA denuncia: esperado 1 aberta, veio %', n; end if;

  perform public.report_sponsor_abuse('b0000000-0000-4000-8000-00000000000d', 'de novo');
  select count(*) into n from public.sponsor_abuse_reports
  where status = 'aberta' and sponsorship_id = 'b0000000-0000-4000-8000-00000000000d';
  if n <> 1 then raise exception 'FALHA denuncia: duplicou (% abertas)', n; end if;

  -- Bob não é da moderação: não vê a fila nem decide.
  select count(*) into n from public.list_abuse_reports();
  if n <> 0 then raise exception 'FALHA list_abuse_reports: vazou % para nao-staff', n; end if;

  begin
    select public.review_abuse_report(v_id, true) into ok;
    raise exception 'FALHA review_abuse_report: nao-staff decidiu denuncia';
  exception when sqlstate '42501' then null; -- esperado
  end;

  select count(*) into n from public.list_hidden_signals();
  if n <> 0 then raise exception 'FALHA list_hidden_signals: vazou sinal para nao-staff'; end if;
end $$;

-- O id da denúncia vai para uma temp table: a moderadora não enxerga a LINHA
-- (a policy é da empresa dona), só a fila pela RPC.
reset role;
create temp table t_denuncia as
  select id from public.sponsor_abuse_reports
  where status = 'aberta' and sponsorship_id = 'b0000000-0000-4000-8000-00000000000d';
-- A temp table nasce sem GRANT: quem roda como `authenticated` precisa ler.
grant select on t_denuncia to authenticated;

-- Alice é de outra empresa: não mexe no patrocínio da igreja do Bob.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare ok boolean; v_id uuid;
begin
  begin
    select public.set_sponsorship_hidden('b0000000-0000-4000-8000-00000000000d', true) into ok;
    raise exception 'FALHA esconder: outra empresa escondeu patrocinador alheio';
  exception when sqlstate '42501' then null; -- esperado
  end;

  begin
    select public.report_sponsor_abuse('b0000000-0000-4000-8000-00000000000d', 'nao e minha igreja') into v_id;
    raise exception 'FALHA denuncia: outra empresa denunciou patrocinio alheio';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

-- Alice virou staff mais acima nesta suíte: pela moderação, a fila abre.
do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.list_abuse_reports()
  where sponsorship_id = 'b0000000-0000-4000-8000-00000000000d';
  if n <> 1 then raise exception 'FALHA list_abuse_reports: staff viu % denuncias', n; end if;

  select public.review_abuse_report((select id from t_denuncia), true, 'confirmado') into ok;
  if not ok then raise exception 'FALHA review_abuse_report: decisao nao aplicou'; end if;

  select count(*) into n from public.list_abuse_reports()
  where sponsorship_id = 'b0000000-0000-4000-8000-00000000000d';
  if n <> 0 then raise exception 'FALHA review_abuse_report: denuncia seguiu aberta'; end if;
end $$;

reset role;

do $$
declare n int;
begin
  -- Decidir a denúncia NÃO esconde ninguém: isso é decisão de cada igreja.
  select count(*) into n from public.sponsorships
  where id = 'b0000000-0000-4000-8000-00000000000d' and hidden_at is null;
  if n <> 1 then
    raise exception 'FALHA review_abuse_report: fechar o chamado escondeu o patrocinador';
  end if;

  select count(*) into n from public.platform_staff_actions
  where action = 'abuse.procedente' and entity_id = (select id from t_denuncia);
  if n <> 1 then
    raise exception 'FALHA platform_staff_actions: denuncia nao foi auditada (% linhas)', n;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Bucket dos logos (migration 20260918160000).
--
-- O ponto sensível: escrever direto em `publico/` pularia a moderação
-- inteira. Só service_role pode, e é isso que está sendo provado.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
begin
  -- Na própria pasta pendente: liberado.
  insert into storage.objects (bucket_id, name)
  values ('sponsor-logos', 'pendente/a1a1a1a1-0000-4000-8000-000000000001/logo.png');

  -- Direto na pasta pública: é o atalho que não pode existir.
  begin
    insert into storage.objects (bucket_id, name)
    values ('sponsor-logos', 'publico/5a5a5a5a-0000-4000-8000-000000000001/logo.png');
    raise exception 'FALHA storage: patrocinador escreveu na pasta publica (pulou a moderacao)';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- Na pasta pendente de OUTRO usuário: bloqueado.
  begin
    insert into storage.objects (bucket_id, name)
    values ('sponsor-logos', 'pendente/b2b2b2b2-0000-4000-8000-000000000002/logo.png');
    raise exception 'FALHA storage: escreveu na pasta pendente de outro usuario';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- Sem prefixo de pasta: também não.
  begin
    insert into storage.objects (bucket_id, name)
    values ('sponsor-logos', 'logo.png');
    raise exception 'FALHA storage: escreveu na raiz do bucket';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Destravar conta bloqueada pelo "não fui eu" (migration 20260918180000).
-- ---------------------------------------------------------------------------
reset role;

update public.sponsor_accounts
set security_hold_at = now()
where id = '5b5b5b5b-0000-4000-8000-000000000002';

-- Bob é o dono da conta travada, e não é da moderação: não se destrava.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);

do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.list_security_holds();
  if n <> 0 then raise exception 'FALHA list_security_holds: vazou % para nao-staff', n; end if;

  begin
    select public.release_sponsor_security_hold('5b5b5b5b-0000-4000-8000-000000000002') into ok;
    raise exception 'FALHA release: o proprio dono destravou a conta';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

-- Alice é a moderação (cadastrada mais acima nesta suíte).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.list_security_holds()
  where sponsor_account_id = '5b5b5b5b-0000-4000-8000-000000000002';
  if n <> 1 then raise exception 'FALHA list_security_holds: staff viu % contas', n; end if;

  select public.release_sponsor_security_hold('5b5b5b5b-0000-4000-8000-000000000002') into ok;
  if not ok then raise exception 'FALHA release: nao liberou'; end if;

  -- Liberar duas vezes não é erro, é no-op: devolve false.
  select public.release_sponsor_security_hold('5b5b5b5b-0000-4000-8000-000000000002') into ok;
  if ok then raise exception 'FALHA release: liberou conta que ja estava livre'; end if;
end $$;

reset role;

do $$
declare n int;
begin
  select count(*) into n from public.sponsor_accounts
  where id = '5b5b5b5b-0000-4000-8000-000000000002' and security_hold_at is null;
  if n <> 1 then raise exception 'FALHA release: a conta continua travada'; end if;

  select count(*) into n from public.platform_staff_actions
  where action = 'sponsor_account.hold_liberado'
    and entity_id = '5b5b5b5b-0000-4000-8000-000000000002';
  if n <> 1 then
    raise exception 'FALHA platform_staff_actions: liberacao nao foi auditada (% linhas)', n;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Igreja excluída sai do ar (migration 20260919140000).
-- ---------------------------------------------------------------------------
reset role;

update public.churches set deleted_at = now()
where id = 'd2d2d2d2-0000-4000-8000-000000000002';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.churches
  where id = 'd2d2d2d2-0000-4000-8000-000000000002';
  if n <> 0 then
    raise exception 'FALHA churches: igreja excluida segue visivel na pagina publica';
  end if;

  -- A ativa continua pública: o filtro não pode derrubar quem está no ar.
  select count(*) into n from public.churches
  where id = 'd1d1d1d1-0000-4000-8000-000000000001';
  if n <> 1 then
    raise exception 'FALHA churches: igreja ativa sumiu da pagina publica';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Contagem de pendências dos badges (migration 20260919160000).
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- Quem não modera não descobre quantas denúncias existem na plataforma.
  select count(*) into n from public.platform_pending_counts();
  if n <> 0 then raise exception 'FALHA platform_pending_counts: devolveu contagem para nao-staff'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare v record;
begin
  select * into v from public.platform_pending_counts();
  if v is null then raise exception 'FALHA platform_pending_counts: staff ficou sem contagem'; end if;
  -- O pedido da Alice segue pendente desde a seção da moderação de perfil.
  if v.alteracoes < 1 then
    raise exception 'FALHA platform_pending_counts: nao contou alteracao pendente (%)', v.alteracoes;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Tema da igreja resolvido para quem visita sem login (migration 20260919180000).
-- `select *` em churches falhava para o anon e toda igreja caía no tema padrão.
-- ---------------------------------------------------------------------------
reset role;

update public.churches
set template_mode = 'custom',
    template_id = (select id from public.templates where slug = 'classico')
where id = 'd1d1d1d1-0000-4000-8000-000000000001';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare v uuid;
begin
  select public.resolve_template('d1d1d1d1-0000-4000-8000-000000000001') into v;
  if v is distinct from (select id from public.templates where slug = 'classico') then
    raise exception 'FALHA resolve_template: anon nao recebeu o tema escolhido (%)', coalesce(v::text, '<null>');
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Cor de destaque da página (migration 20260926110000).
--
-- A cor vira atributo `style` numa página pública, então o banco só aceita
-- #rrggbb; quem escreve é o admin da própria igreja, nunca o de outra; e o
-- visitante (anon) lê a cor junto com o tema.
-- ---------------------------------------------------------------------------
do $$
begin
  -- CHECK vale até para superuser: nada de CSS solto no banco.
  begin
    update public.churches set accent_color = 'red' where id = 'd1d1d1d1-0000-4000-8000-000000000001';
    raise exception 'FALHA accent_color: aceitou nome de cor';
  exception when check_violation then null; -- esperado
  end;
  begin
    update public.churches set accent_color = '#2563eb;background:url(//x)'
    where id = 'd1d1d1d1-0000-4000-8000-000000000001';
    raise exception 'FALHA accent_color: aceitou CSS injetado';
  exception when check_violation then null; -- esperado
  end;
  begin
    update public.churches set accent_color = '#2563EB' where id = 'd1d1d1d1-0000-4000-8000-000000000001';
    raise exception 'FALHA accent_color: aceitou maiusculas (o service normaliza antes)';
  exception when check_violation then null; -- esperado
  end;
end $$;

-- Alice administra a igreja d1: muda a cor dela; a da igreja do Bob (d2), não.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

update public.churches set accent_color = '#2563eb' where id = 'd1d1d1d1-0000-4000-8000-000000000001';
update public.churches set accent_color = '#be123c' where id = 'd2d2d2d2-0000-4000-8000-000000000002';

reset role;

do $$
declare cor_alice text; cor_bob text;
begin
  select accent_color into cor_alice from public.churches where id = 'd1d1d1d1-0000-4000-8000-000000000001';
  select accent_color into cor_bob   from public.churches where id = 'd2d2d2d2-0000-4000-8000-000000000002';
  if cor_alice is distinct from '#2563eb' then
    raise exception 'FALHA accent_color: admin nao gravou a cor da propria igreja (%)', coalesce(cor_alice, '<null>');
  end if;
  if cor_bob is not null then
    raise exception 'FALHA accent_color: admin mudou a cor da igreja de OUTRA empresa (%)', cor_bob;
  end if;
end $$;

-- O visitante lê tema e cor juntos.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare v_tema uuid; v_cor text; n int;
begin
  select template_id, accent_color into v_tema, v_cor
  from public.resolve_church_appearance('d1d1d1d1-0000-4000-8000-000000000001');
  if v_tema is distinct from (select id from public.templates where slug = 'classico') or v_cor is distinct from '#2563eb' then
    raise exception 'FALHA resolve_church_appearance: anon recebeu tema/cor inesperados (%/%)', coalesce(v_tema::text, '<null>'), coalesce(v_cor, '<null>');
  end if;

  -- Igreja sem tema próprio e sem mãe: nenhuma linha (a página usa o padrão).
  select count(*) into n from public.resolve_church_appearance('d2d2d2d2-0000-4000-8000-000000000002');
  if n <> 0 then
    raise exception 'FALHA resolve_church_appearance: igreja sem tema devolveu % linha(s)', n;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Eventos da igreja e inscrição (migration 20260919220000).
-- ---------------------------------------------------------------------------
reset role;

insert into public.church_events (id, church_id, titulo, inicio, preco_cents, inscricoes_abertas, deleted_at) values
  ('e0e0e0e0-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 'Retiro RLS', now() + interval '10 days', 18000, true,  null),
  ('e0e0e0e0-0000-4000-8000-000000000002', 'd1d1d1d1-0000-4000-8000-000000000001', 'Passado RLS', now() - interval '1 day', 0, true, null),
  ('e0e0e0e0-0000-4000-8000-000000000003', 'd1d1d1d1-0000-4000-8000-000000000001', 'Fechado RLS', now() + interval '10 days', 0, false, null),
  ('e0e0e0e0-0000-4000-8000-000000000004', 'd1d1d1d1-0000-4000-8000-000000000001', 'Apagado RLS', now() + interval '10 days', 0, true, now());

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare n int; v uuid;
begin
  -- Evento publicado é público; apagado não.
  select count(*) into n from public.church_events
  where id in ('e0e0e0e0-0000-4000-8000-000000000001', 'e0e0e0e0-0000-4000-8000-000000000004');
  if n <> 1 then raise exception 'FALHA church_events: anon viu % (esperado so o nao apagado)', n; end if;

  -- O caminho antigo — gravar direto com qualquer nome de evento — acabou.
  begin
    insert into public.event_signups (church_id, event_name, person_name, contact)
    values ('d1d1d1d1-0000-4000-8000-000000000001', 'evento inventado', 'Fulano', '11999999999');
    raise exception 'FALHA event_signups: anon gravou inscricao direto, sem evento';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- Inscrição válida: o nome do evento sai do banco, não do visitante.
  select public.sign_up_for_event('e0e0e0e0-0000-4000-8000-000000000001', 'Ana Visitante', '11988887777') into v;
  if v is null then raise exception 'FALHA sign_up_for_event: inscricao valida nao gravou'; end if;

  begin
    perform public.sign_up_for_event('e0e0e0e0-0000-4000-8000-000000000002', 'Ana', '11988887777');
    raise exception 'FALHA sign_up_for_event: aceitou evento que ja comecou';
  exception when sqlstate 'P0001' then null; -- esperado
  end;

  begin
    perform public.sign_up_for_event('e0e0e0e0-0000-4000-8000-000000000003', 'Ana', '11988887777');
    raise exception 'FALHA sign_up_for_event: aceitou evento com inscricoes encerradas';
  exception when sqlstate 'P0001' then null; -- esperado
  end;

  begin
    perform public.sign_up_for_event('e0e0e0e0-0000-4000-8000-000000000004', 'Ana', '11988887777');
    raise exception 'FALHA sign_up_for_event: aceitou evento apagado';
  exception when sqlstate 'P0002' then null; -- esperado
  end;
end $$;

reset role;

do $$
declare n int;
begin
  select count(*) into n from public.event_signups
  where event_id = 'e0e0e0e0-0000-4000-8000-000000000001'
    and event_name = 'Retiro RLS'
    and church_id = 'd1d1d1d1-0000-4000-8000-000000000001'
    and company_id = 'c1c1c1c1-0000-4000-8000-000000000001';
  if n <> 1 then
    raise exception 'FALHA sign_up_for_event: inscricao nao ficou amarrada ao evento/igreja/empresa (%)', n;
  end if;
end $$;

-- Bob é de outra empresa: não publica evento na página da igreja da Alice.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);

do $$
begin
  begin
    insert into public.church_events (church_id, titulo, inicio)
    values ('d1d1d1d1-0000-4000-8000-000000000001', 'Evento intruso', now() + interval '5 days');
    raise exception 'FALHA church_events: outra empresa publicou evento na igreja alheia';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

-- A dona da igreja publica normalmente.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

insert into public.church_events (church_id, titulo, inicio)
values ('d1d1d1d1-0000-4000-8000-000000000001', 'Evento da Alice', now() + interval '5 days');

reset role;

-- ---------------------------------------------------------------------------
-- Programação com contagem de inscritos (migration 20260920120000).
-- A função é SECURITY INVOKER: a contagem precisa passar pela RLS de
-- event_signups, senão outra empresa leria quantos inscritos a igreja tem.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- A dona vê o inscrito do Retiro RLS (inscrito mais acima nesta suíte).
  select inscritos into n from public.list_company_events('c1c1c1c1-0000-4000-8000-000000000001')
  where id = 'e0e0e0e0-0000-4000-8000-000000000001';
  if n is distinct from 1 then
    raise exception 'FALHA list_company_events: dona viu % inscritos (esperado 1)', coalesce(n::text, '<null>');
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- Bob é de outra empresa: o evento é público, a contagem de inscritos não.
  select inscritos into n from public.list_company_events('c1c1c1c1-0000-4000-8000-000000000001')
  where id = 'e0e0e0e0-0000-4000-8000-000000000001';
  if n is distinct from 0 then
    raise exception 'FALHA list_company_events: outra empresa viu % inscritos da igreja alheia', n;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Programação da igreja (migration 20260920140000).
-- ---------------------------------------------------------------------------
reset role;

insert into public.church_schedule (id, church_id, titulo, tipo, dia_semana, hora) values
  ('f0f0f0f0-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 'Culto RLS', 'semanal', 0, '18:00');

-- Semanal sem dia, ou com data, não entra: o CHECK do banco segura.
do $$
begin
  begin
    insert into public.church_schedule (church_id, titulo, tipo, hora)
    values ('d1d1d1d1-0000-4000-8000-000000000001', 'Sem dia', 'semanal', '10:00');
    raise exception 'FALHA church_schedule: aceitou semanal sem dia da semana';
  exception when check_violation then null; -- esperado
  end;
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.church_schedule where id = 'f0f0f0f0-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'FALHA church_schedule: visitante nao ve a programacao'; end if;

  begin
    insert into public.church_schedule (church_id, titulo, tipo, dia_semana, hora)
    values ('d1d1d1d1-0000-4000-8000-000000000001', 'Anon', 'semanal', 1, '10:00');
    raise exception 'FALHA church_schedule: anon gravou na programacao';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  begin
    insert into public.church_schedule (church_id, titulo, tipo, dia_semana, hora)
    values ('d1d1d1d1-0000-4000-8000-000000000001', 'Intruso', 'semanal', 1, '10:00');
    raise exception 'FALHA church_schedule: outra empresa gravou na programacao alheia';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- Remover (soft delete) item de outra igreja: a policy esconde a linha.
  update public.church_schedule set deleted_at = now()
  where id = 'f0f0f0f0-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA church_schedule: outra empresa removeu item alheio'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  insert into public.church_schedule (church_id, titulo, tipo, data, hora)
  values ('d1d1d1d1-0000-4000-8000-000000000001', 'Santa Ceia RLS', 'especial', current_date + 10, '18:00');

  update public.church_schedule set deleted_at = now()
  where id = 'f0f0f0f0-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA church_schedule: dona nao conseguiu remover'; end if;
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.church_schedule where id = 'f0f0f0f0-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FALHA church_schedule: item removido segue publico'; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Hierarquia Sede -> Subsede -> Congregação (migration 20260921100000).
--
-- Árvore montada (como superuser):
--     S (sede)
--     └── Y (subsede) ── B (congregação)
--     X (subsede SOLTA, sem sede ainda) ── A (congregação)
--
-- Provas: congregação A não vê B; subsede X não vê Y; a sede só vê o que está
-- abaixo dela; ligar X à sede depois é só preencher parent_id — os paths da
-- subárvore se ajustam e nenhum dado de negócio é tocado.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('5e5e5e5e-0000-4000-8000-000000000001', 'rls-sede@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Sede"}'),
  ('5e5e5e5e-0000-4000-8000-000000000002', 'rls-subx@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Subsede X"}'),
  ('5e5e5e5e-0000-4000-8000-000000000003', 'rls-suby@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Subsede Y"}'),
  ('5e5e5e5e-0000-4000-8000-000000000004', 'rls-conga@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Congregacao A"}'),
  ('5e5e5e5e-0000-4000-8000-000000000005', 'rls-congb@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Congregacao B"}'),
  ('5e5e5e5e-0000-4000-8000-000000000006', 'rls-membx@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Member X"}'),
  ('5e5e5e5e-0000-4000-8000-000000000007', 'rls-staff2@test.local','authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Staff arvore"}'),
  ('5e5e5e5e-0000-4000-8000-000000000008', 'rls-patro2@test.local','authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Patrocinador arvore"}');

insert into public.companies (id, name, slug, created_by) values
  ('6c6c6c6c-0000-4000-8000-000000000001', 'Sede',  'rls-arv-sede',  '5e5e5e5e-0000-4000-8000-000000000001'),
  ('6c6c6c6c-0000-4000-8000-000000000002', 'Sub X', 'rls-arv-subx',  '5e5e5e5e-0000-4000-8000-000000000002'),
  ('6c6c6c6c-0000-4000-8000-000000000003', 'Sub Y', 'rls-arv-suby',  '5e5e5e5e-0000-4000-8000-000000000003'),
  ('6c6c6c6c-0000-4000-8000-000000000004', 'Cong A','rls-arv-conga', '5e5e5e5e-0000-4000-8000-000000000004'),
  ('6c6c6c6c-0000-4000-8000-000000000005', 'Cong B','rls-arv-congb', '5e5e5e5e-0000-4000-8000-000000000005');

insert into public.company_members (company_id, user_id, role) values
  ('6c6c6c6c-0000-4000-8000-000000000001', '5e5e5e5e-0000-4000-8000-000000000001', 'owner'),
  ('6c6c6c6c-0000-4000-8000-000000000002', '5e5e5e5e-0000-4000-8000-000000000002', 'owner'),
  ('6c6c6c6c-0000-4000-8000-000000000003', '5e5e5e5e-0000-4000-8000-000000000003', 'owner'),
  ('6c6c6c6c-0000-4000-8000-000000000004', '5e5e5e5e-0000-4000-8000-000000000004', 'owner'),
  ('6c6c6c6c-0000-4000-8000-000000000005', '5e5e5e5e-0000-4000-8000-000000000005', 'owner'),
  ('6c6c6c6c-0000-4000-8000-000000000002', '5e5e5e5e-0000-4000-8000-000000000006', 'member');

insert into public.churches (id, company_id, name, slug, public_code, tipo, parent_id) values
  ('7d7d7d7d-0000-4000-8000-000000000001', '6c6c6c6c-0000-4000-8000-000000000001', 'Sede',   'rls-arv-sede',  'rls-arv-sede',  'sede',        null),
  ('7d7d7d7d-0000-4000-8000-000000000003', '6c6c6c6c-0000-4000-8000-000000000003', 'Sub Y',  'rls-arv-suby',  'rls-arv-suby',  'subsede',     '7d7d7d7d-0000-4000-8000-000000000001'),
  ('7d7d7d7d-0000-4000-8000-000000000002', '6c6c6c6c-0000-4000-8000-000000000002', 'Sub X',  'rls-arv-subx',  'rls-arv-subx',  'subsede',     null),
  ('7d7d7d7d-0000-4000-8000-000000000004', '6c6c6c6c-0000-4000-8000-000000000004', 'Cong A', 'rls-arv-conga', 'rls-arv-conga', 'congregacao', '7d7d7d7d-0000-4000-8000-000000000002'),
  ('7d7d7d7d-0000-4000-8000-000000000005', '6c6c6c6c-0000-4000-8000-000000000005', 'Cong B', 'rls-arv-congb', 'rls-arv-congb', 'congregacao', '7d7d7d7d-0000-4000-8000-000000000003');

-- Um de cada dado de igreja em cada nó. company_id vem do trigger.
insert into public.prayer_requests (church_id, message)
select id, 'pedido ' || name from public.churches where id::text like '7d7d7d7d-%';
insert into public.visitors (church_id, name, contact)
select id, 'visitante ' || name, '11999990000' from public.churches where id::text like '7d7d7d7d-%';
insert into public.event_signups (church_id, event_name, person_name, contact)
select id, 'evento', 'inscrito ' || name, '11999990000' from public.churches where id::text like '7d7d7d7d-%';

insert into public.sponsor_accounts (id, user_id, kind, display_name, email, document, billing_status)
values ('8a8a8a8a-0000-4000-8000-000000000001', '5e5e5e5e-0000-4000-8000-000000000008',
        'business', 'Patrocinador Arvore', 'rls-patro2@test.local', '11222333000181', 'active');
insert into public.sponsorships (sponsor_id, church_id, company_id, status, activated_at)
select '8a8a8a8a-0000-4000-8000-000000000001', id, company_id, 'active', now()
from public.churches where id::text like '7d7d7d7d-%';

insert into public.platform_staff (user_id, email)
values ('5e5e5e5e-0000-4000-8000-000000000007', 'rls-staff2@test.local');

-- Estado inicial dos paths e tipos.
do $$
declare v_path text;
begin
  select path::text into v_path from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000005';
  if v_path <> 'rls-arv-sede.rls-arv-suby.rls-arv-congb' then
    raise exception 'FALHA arvore: path de B inesperado (%)', v_path;
  end if;
  select path::text into v_path from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000004';
  if v_path <> 'rls-arv-subx.rls-arv-conga' then
    raise exception 'FALHA arvore: path de A inesperado (%)', v_path;
  end if;
end $$;

-- Regras da árvore (como superuser: é o trigger que barra, não o GRANT).
do $$
begin
  begin
    insert into public.churches (company_id, name, slug, public_code, tipo, parent_id)
    values ('6c6c6c6c-0000-4000-8000-000000000004', 'Neta', 'rls-arv-neta', 'rls-arv-neta', 'congregacao',
            '7d7d7d7d-0000-4000-8000-000000000004');
    raise exception 'FALHA arvore: congregacao aceitou congregacao abaixo dela';
  exception when sqlstate '23514' then null;
  end;

  begin
    insert into public.churches (company_id, name, slug, public_code, tipo)
    values ('6c6c6c6c-0000-4000-8000-000000000004', 'Orfa', 'rls-arv-orfa', 'rls-arv-orfa', 'congregacao');
    raise exception 'FALHA arvore: congregacao sem igreja acima foi aceita';
  exception when sqlstate '23514' then null;
  end;

  begin
    update public.churches set parent_id = '7d7d7d7d-0000-4000-8000-000000000001'
    where id = '7d7d7d7d-0000-4000-8000-000000000001';
    raise exception 'FALHA arvore: sede ficou abaixo de si mesma';
  exception when sqlstate '23514' then null;
  end;

  -- Subsede Y tem congregação abaixo: não pode virar congregação.
  begin
    update public.churches set tipo = 'congregacao', parent_id = '7d7d7d7d-0000-4000-8000-000000000001'
    where id = '7d7d7d7d-0000-4000-8000-000000000003';
    raise exception 'FALHA arvore: subsede com filhas virou congregacao';
  exception when sqlstate '23514' then null;
  end;
end $$;

-- ------------------------- congregação A ----------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000004","email":"rls-conga@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.prayer_requests where church_id::text like '7d7d7d7d-%';
  if n <> 1 then raise exception 'FALHA arvore: congregacao A ve % pedidos (esperado 1, o dela)', n; end if;
  select count(*) into n from public.prayer_requests where church_id = '7d7d7d7d-0000-4000-8000-000000000005';
  if n <> 0 then raise exception 'FALHA arvore: congregacao A enxerga a congregacao B'; end if;
  select count(*) into n from public.visitors where church_id = '7d7d7d7d-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA arvore: congregacao enxerga a subsede acima dela'; end if;

  -- Ninguém da igreja cria igreja pelo client (INSERT revogado).
  begin
    insert into public.churches (company_id, name, slug, public_code)
    values ('6c6c6c6c-0000-4000-8000-000000000004', 'Invasora', 'rls-arv-inv', 'rls-arv-inv');
    raise exception 'FALHA arvore: authenticated inseriu igreja direto';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- Pedido de visita: só a equipe da PRÓPRIA igreja marca a visita; o
-- formulário público não consegue gravar "visita feita".
do $$
declare v uuid; n int;
begin
  select id into v from public.visitors where church_id = '7d7d7d7d-0000-4000-8000-000000000004';
  perform public.registrar_visita(v, current_date, 'Pr. Teste', null);
  select count(*) into n from public.visitors where id = v and visitado_por = 'Pr. Teste';
  if n <> 1 then raise exception 'FALHA visita: congregacao nao registrou a propria visita'; end if;

  -- Pedido de outra igreja (congregação B, mesma árvore): recusado.
  select id into v from public.visitors where church_id = '7d7d7d7d-0000-4000-8000-000000000005';
  begin
    perform public.registrar_visita(v, current_date, 'Invasor', null);
    raise exception 'FALHA visita: congregacao A marcou visita da congregacao B';
  exception when sqlstate 'P0002' then null;
  end;

  -- Sem GRANT de update: não altera a tabela direto.
  begin
    update public.visitors set visitado_por = 'x' where church_id = '7d7d7d7d-0000-4000-8000-000000000004';
    raise exception 'FALHA visita: authenticated alterou visitors direto';
  exception when sqlstate '42501' then null;
  end;

  -- Insert público não grava os campos da visita.
  begin
    insert into public.visitors (church_id, name, contact, visitado_em)
    values ('7d7d7d7d-0000-4000-8000-000000000004', 'x', '11999990000', current_date);
    raise exception 'FALHA visita: insert publico gravou visitado_em';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- ------------------------- subsede X (owner) ------------------------------
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000002","email":"rls-subx@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- X vê X e A nos dados de contato; pedido de oração é só da própria igreja
  -- (migration 20260922120000), e da congregação X só recebe a CONTAGEM.
  select count(*) into n from public.prayer_requests where church_id::text like '7d7d7d7d-%';
  if n <> 1 then raise exception 'FALHA arvore: subsede X ve % pedidos (esperado 1, o dela)', n; end if;
  select count(*) into n from public.prayer_counts_tree(365) where church_id::text like '7d7d7d7d-%';
  if n <> 2 then raise exception 'FALHA oracao: subsede X ve contagem de % igrejas (esperado 2)', n; end if;
  select total into n from public.prayer_counts_tree(365)
  where church_id = '7d7d7d7d-0000-4000-8000-000000000004';
  if n <> 1 then raise exception 'FALHA oracao: contagem da congregacao A veio %', n; end if;
  select count(*) into n from public.visitors where church_id::text like '7d7d7d7d-%';
  if n <> 2 then raise exception 'FALHA arvore: subsede X ve % visitantes (esperado 2)', n; end if;
  select count(*) into n from public.event_signups where church_id::text like '7d7d7d7d-%';
  if n <> 2 then raise exception 'FALHA arvore: subsede X ve % inscricoes (esperado 2)', n; end if;
  select count(*) into n from public.sponsorships where church_id::text like '7d7d7d7d-%';
  if n <> 2 then raise exception 'FALHA arvore: admin de X ve % patrocinios (esperado 2)', n; end if;

  -- Subsede X não vê subsede Y nem a congregação de Y.
  select count(*) into n from public.prayer_requests
  where church_id in ('7d7d7d7d-0000-4000-8000-000000000003', '7d7d7d7d-0000-4000-8000-000000000005');
  if n <> 0 then raise exception 'FALHA arvore: subsede X enxerga a subsede Y'; end if;

  -- Árvore só muda pela plataforma: sem GRANT de UPDATE em parent_id/tipo.
  begin
    update public.churches set parent_id = '7d7d7d7d-0000-4000-8000-000000000001'
    where id = '7d7d7d7d-0000-4000-8000-000000000002';
    raise exception 'FALHA arvore: admin mudou parent_id direto';
  exception when sqlstate '42501' then null;
  end;
  begin
    update public.churches set tipo = 'sede' where id = '7d7d7d7d-0000-4000-8000-000000000002';
    raise exception 'FALHA arvore: admin mudou o proprio tipo';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.platform_set_church_hierarchy(
      '7d7d7d7d-0000-4000-8000-000000000002', 'subsede', '7d7d7d7d-0000-4000-8000-000000000001');
    raise exception 'FALHA arvore: nao-staff usou a RPC da plataforma';
  exception when sqlstate '42501' then null;
  end;

  -- Leitura desce a árvore; escrita não: X não publica evento na agenda de A.
  begin
    insert into public.church_events (church_id, titulo, inicio)
    values ('7d7d7d7d-0000-4000-8000-000000000004', 'Evento imposto', now() + interval '5 days');
    raise exception 'FALHA arvore: subsede escreveu na agenda da congregacao';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- --------------------------- subsede X (member) ---------------------------
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000006","email":"rls-membx@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- Pedido de oração é dado sensível: member não lê nem o da própria igreja,
  -- nem a contagem das de baixo.
  select count(*) into n from public.prayer_requests where church_id::text like '7d7d7d7d-%';
  if n <> 0 then raise exception 'FALHA oracao: member leu % pedidos', n; end if;
  select count(*) into n from public.prayer_counts_tree(365) where church_id::text like '7d7d7d7d-%';
  if n <> 0 then raise exception 'FALHA oracao: member leu contagem de % igrejas', n; end if;
  -- Contato deixado para ser procurado segue visível pela árvore.
  select count(*) into n from public.visitors where church_id::text like '7d7d7d7d-%';
  if n <> 2 then raise exception 'FALHA arvore: member de X ve % visitantes (esperado 2)', n; end if;
  -- Patrocínio é leitura de gestão: member não vê nem o da própria igreja.
  select count(*) into n from public.sponsorships where church_id::text like '7d7d7d7d-%';
  if n <> 0 then raise exception 'FALHA arvore: member ve patrocinios'; end if;
end $$;

-- ------------------------- sede, ANTES de ligar X -------------------------
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000001","email":"rls-sede@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- Texto de pedido de oração: só o da própria sede, nunca o das de baixo.
  select count(*) into n from public.prayer_requests where church_id::text like '7d7d7d7d-%';
  if n <> 1 then raise exception 'FALHA oracao: sede leu % pedidos (esperado 1, o dela)', n; end if;
  -- Contagem: a própria e as de baixo (S, Y, B) — X ainda não é dela.
  select count(*) into n from public.prayer_counts_tree(365) where church_id::text like '7d7d7d7d-%';
  if n <> 3 then raise exception 'FALHA oracao: sede ve contagem de % igrejas antes de ligar X (esperado 3)', n; end if;
  select count(*) into n from public.visitors where church_id::text like '7d7d7d7d-%';
  if n <> 3 then raise exception 'FALHA arvore: sede ve % visitantes antes de ligar X (esperado 3)', n; end if;
  select count(*) into n from public.visitors
  where church_id in ('7d7d7d7d-0000-4000-8000-000000000002', '7d7d7d7d-0000-4000-8000-000000000004');
  if n <> 0 then raise exception 'FALHA arvore: sede enxerga subsede que ainda nao e dela'; end if;
end $$;

-- ------------------- plataforma liga X à sede (sem migrar dado) ------------
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000007","email":"rls-staff2@test.local","role":"authenticated"}', true);

do $$
begin
  perform public.platform_set_church_hierarchy(
    '7d7d7d7d-0000-4000-8000-000000000002', 'subsede', '7d7d7d7d-0000-4000-8000-000000000001');
end $$;

reset role;

do $$
declare v_path text; n int;
begin
  -- A subárvore inteira foi junto (a congregação A também).
  select path::text into v_path from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000004';
  if v_path <> 'rls-arv-sede.rls-arv-subx.rls-arv-conga' then
    raise exception 'FALHA arvore: path de A nao acompanhou a ligacao (%)', v_path;
  end if;
  -- Dado de negócio intocado: o company_id dos registros segue o de cada igreja.
  select count(*) into n from public.prayer_requests p
  join public.churches c on c.id = p.church_id
  where c.id::text like '7d7d7d7d-%' and p.company_id is distinct from c.company_id;
  if n <> 0 then raise exception 'FALHA arvore: ligar a sede alterou dado de negocio'; end if;
  -- E a decisão ficou registrada na trilha da plataforma.
  select count(*) into n from public.platform_staff_actions
  where action = 'church.hierarchy.set' and entity_id = '7d7d7d7d-0000-4000-8000-000000000002';
  if n <> 1 then raise exception 'FALHA arvore: ligacao sem registro em platform_staff_actions'; end if;
end $$;

-- --------------------------- sede, DEPOIS de ligar X ----------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000001","email":"rls-sede@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.prayer_counts_tree(365) where church_id::text like '7d7d7d7d-%';
  if n <> 5 then raise exception 'FALHA oracao: sede ve contagem de % igrejas depois de ligar X (esperado 5)', n; end if;
  select count(*) into n from public.prayer_requests where church_id::text like '7d7d7d7d-%';
  if n <> 1 then raise exception 'FALHA oracao: ligar a subsede deu acesso ao TEXTO de % pedidos', n; end if;
  select count(*) into n from public.sponsorships where church_id::text like '7d7d7d7d-%';
  if n <> 5 then raise exception 'FALHA arvore: sede ve % patrocinios (esperado 5)', n; end if;
end $$;

-- Subsede Y continua sem ver X, mesmo agora que as duas têm a mesma sede.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000003","email":"rls-suby@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.prayer_counts_tree(365) where church_id::text like '7d7d7d7d-%';
  if n <> 2 then raise exception 'FALHA arvore: subsede Y ve contagem de % igrejas (esperado 2: Y e B)', n; end if;
  select count(*) into n from public.visitors
  where church_id in ('7d7d7d7d-0000-4000-8000-000000000002', '7d7d7d7d-0000-4000-8000-000000000004');
  if n <> 0 then raise exception 'FALHA arvore: subsede Y enxerga a irma X'; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Visitas à página pública (migration 20260921110000). Reaproveita a árvore
-- acima, já com X ligada à sede.
-- ---------------------------------------------------------------------------
insert into public.church_page_visits (church_id, origem) values
  ('7d7d7d7d-0000-4000-8000-000000000004', 'qr'),
  ('7d7d7d7d-0000-4000-8000-000000000004', 'nfc'),
  ('7d7d7d7d-0000-4000-8000-000000000005', 'link'),
  ('7d7d7d7d-0000-4000-8000-000000000001', 'link');

-- A igreja B escondeu a marca ONTEM: a visita de hoje não conta para ele.
update public.sponsorships set hidden_at = now() - interval '1 day'
where church_id = '7d7d7d7d-0000-4000-8000-000000000005';

-- Ninguém grava visita pela chave pública (inflaria a métrica do patrocinador).
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    insert into public.church_page_visits (church_id, origem)
    values ('7d7d7d7d-0000-4000-8000-000000000004', 'qr');
    raise exception 'FALHA visitas: anon gravou visita';
  exception when sqlstate '42501' then null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000004","email":"rls-conga@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  begin
    insert into public.church_page_visits (church_id, origem)
    values ('7d7d7d7d-0000-4000-8000-000000000004', 'qr');
    raise exception 'FALHA visitas: igreja gravou visita pelo client';
  exception when sqlstate '42501' then null;
  end;

  select count(*) into n from public.church_page_visits where church_id::text like '7d7d7d7d-%';
  if n <> 2 then raise exception 'FALHA visitas: congregacao A ve % visitas (esperado 2)', n; end if;

  -- Métrica da plataforma não abre para igreja.
  begin
    perform * from public.platform_visits_by_week(8);
    raise exception 'FALHA visitas: igreja leu a metrica da plataforma';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform * from public.platform_pilot_summary();
    raise exception 'FALHA visitas: igreja leu o resumo do piloto';
  exception when sqlstate '42501' then null;
  end;

  -- Quem não é patrocinador recebe lista vazia, não a de outro.
  select count(*) into n from public.sponsor_church_visits(6);
  if n <> 0 then raise exception 'FALHA visitas: nao-patrocinador viu % linhas', n; end if;
end $$;

-- Patrocinador: só as igrejas dele, e só enquanto a marca estava no ar.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000008","email":"rls-patro2@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select coalesce(sum(visitas), 0) into n from public.sponsor_church_visits(6)
  where church_id::text like '7d7d7d7d-%';
  if n <> 3 then raise exception 'FALHA visitas: patrocinador ve % visitas (esperado 3: A=2, S=1; B escondeu)', n; end if;

  select count(*) into n from public.sponsor_church_visits(6)
  where church_id = '7d7d7d7d-0000-4000-8000-000000000005';
  if n <> 0 then raise exception 'FALHA visitas: contou visita depois de a igreja esconder a marca'; end if;
end $$;

-- Staff da plataforma vê os agregados.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000007","email":"rls-staff2@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select coalesce(sum(qr), 0) into n from public.platform_visits_by_week(8)
  where church_id = '7d7d7d7d-0000-4000-8000-000000000004';
  if n <> 1 then raise exception 'FALHA visitas: staff viu % leituras de QR em A (esperado 1)', n; end if;

  select patrocinadores_pagantes into n from public.platform_pilot_summary();
  if n < 1 then raise exception 'FALHA visitas: resumo do piloto sem o patrocinador ativo'; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Configurações da plataforma (migration 20260922100000)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000004","email":"rls-conga@test.local","role":"authenticated"}', true);

do $$
begin
  begin
    perform public.platform_get_settings();
    raise exception 'FALHA settings: igreja leu as configuracoes da plataforma';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.platform_update_settings(null, null, null, 3);
    raise exception 'FALHA settings: igreja alterou as configuracoes da plataforma';
  exception when sqlstate '42501' then null;
  end;
  -- Nem com GRANT: a tabela não tem policy nenhuma.
  begin
    perform 1 from public.platform_settings;
    raise exception 'FALHA settings: igreja leu a tabela direto';
  exception when sqlstate '42501' then null;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000007","email":"rls-staff2@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  select carencia_marca_dias into n from public.platform_get_settings();
  if n <> 15 then raise exception 'FALHA settings: carencia inicial veio % (esperado 15)', n; end if;

  select vagas_primeiro_congregacao into n from public.platform_get_settings();
  if n is not null then raise exception 'FALHA settings: vagas deveriam nascer ilimitadas'; end if;

  -- Carência precisa ser inteiro >= 0.
  begin
    perform public.platform_update_settings(null, null, null, -1);
    raise exception 'FALHA settings: carencia negativa foi aceita';
  exception when sqlstate '23514' then null;
  end;

  -- Uma vaga de primeiro patrocínio por congregação.
  perform public.platform_update_settings(null, null, 1, 15);
  select vagas_primeiro_congregacao into n from public.platform_get_settings();
  if n <> 1 then raise exception 'FALHA settings: vagas de congregacao nao gravaram'; end if;

end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Preço do patrocínio, editável pela plataforma (migration 20260926150000)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000004","email":"rls-conga@test.local","role":"authenticated"}', true);

do $$
begin
  begin
    perform public.platform_update_sponsor_price_tiers(
      '[{"position":1,"amount_cents":100}]'::jsonb);
    raise exception 'FALHA preco: igreja alterou o preco do patrocinio';
  exception when sqlstate '42501' then null;
  end;
  -- Nem com GRANT: a tabela não tem policy de escrita nenhuma.
  begin
    update public.sponsor_price_tiers set amount_cents = 100 where position = 1;
    raise exception 'FALHA preco: igreja escreveu na tabela direto';
  exception when sqlstate '42501' then null;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000007","email":"rls-staff2@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- Lista vazia, posição fora de sequência e valor zero/negativo são recusados.
  begin
    perform public.platform_update_sponsor_price_tiers('[]'::jsonb);
    raise exception 'FALHA preco: lista vazia foi aceita';
  exception when sqlstate '23514' then null;
  end;
  begin
    perform public.platform_update_sponsor_price_tiers(
      '[{"position":1,"amount_cents":100},{"position":3,"amount_cents":100}]'::jsonb);
    raise exception 'FALHA preco: posicao fora de sequencia foi aceita';
  exception when sqlstate '23514' then null;
  end;
  begin
    perform public.platform_update_sponsor_price_tiers(
      '[{"position":1,"amount_cents":0}]'::jsonb);
    raise exception 'FALHA preco: valor zero foi aceito';
  exception when sqlstate '23514' then null;
  end;

  -- A staff troca a tabela inteira, e a leitura pública (já existente) reflete na hora.
  perform public.platform_update_sponsor_price_tiers(
    '[{"position":1,"amount_cents":5000},{"position":2,"amount_cents":4000}]'::jsonb);
end $$;

reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.sponsor_price_tiers;
  if n <> 2 then raise exception 'FALHA preco: leitura publica nao refletiu a troca (tem %)', n; end if;
end $$;
reset role;

-- Devolve a tabela ao estado de exemplo, para não confundir outros blocos
-- (reset role já volta ao superusuário da sessão do script).
truncate public.sponsor_price_tiers;
insert into public.sponsor_price_tiers (position, amount_cents) values
  (1, 3990), (2, 3490), (3, 2990), (4, 2790);

-- A trilha é conferida fora da sessão do staff: nem ele lê a tabela direto.
do $$
declare n int;
begin
  select count(*) into n from public.platform_staff_actions
  where action = 'platform.settings.update';
  if n <> 1 then raise exception 'FALHA settings: alteracao sem registro na trilha'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Autopatrocínio: igreja sem patrocinador assume a própria mensalidade
-- (migration 20260926160000)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('5e5e5e5e-0000-4000-8000-00000000000a', 'rls-selfpay-a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Igreja A"}'),
  ('5e5e5e5e-0000-4000-8000-00000000000b', 'rls-selfpay-b@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Igreja B"}');
insert into public.companies (id, name, slug, created_by) values
  ('6c6c6c6c-0000-4000-8000-00000000000a', 'Igreja Autopatrocinio A', 'rls-selfpay-a', '5e5e5e5e-0000-4000-8000-00000000000a'),
  ('6c6c6c6c-0000-4000-8000-00000000000b', 'Igreja Autopatrocinio B', 'rls-selfpay-b', '5e5e5e5e-0000-4000-8000-00000000000b');
insert into public.company_members (company_id, user_id, role) values
  ('6c6c6c6c-0000-4000-8000-00000000000a', '5e5e5e5e-0000-4000-8000-00000000000a', 'owner'),
  ('6c6c6c6c-0000-4000-8000-00000000000b', '5e5e5e5e-0000-4000-8000-00000000000b', 'owner');
insert into public.churches (id, company_id, name, slug, public_code) values
  ('7d7d7d7d-0000-4000-8000-00000000000a', '6c6c6c6c-0000-4000-8000-00000000000a', 'Igreja A', 'rls-selfpay-a', 'rls-selfpay-a'),
  ('7d7d7d7d-0000-4000-8000-00000000000b', '6c6c6c6c-0000-4000-8000-00000000000b', 'Igreja B', 'rls-selfpay-b', 'rls-selfpay-b');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-00000000000a","email":"rls-selfpay-a@test.local","role":"authenticated"}', true);

do $$
declare v_acc record; n int;
begin
  -- Igreja de fora: nem ligar autopatrocínio, nem fechar a porta.
  begin
    perform public.enable_church_self_payment(
      '7d7d7d7d-0000-4000-8000-00000000000b', 'person', 'Invasor', 'x@x.com', null, '11144477735');
    raise exception 'FALHA autopat: ligou autopatrocinio de igreja alheia';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.set_church_aceita_patrocinio('7d7d7d7d-0000-4000-8000-00000000000b', false);
    raise exception 'FALHA autopat: fechou a porta de igreja alheia';
  exception when sqlstate '42501' then null;
  end;

  -- Na própria igreja, sem patrocinador: liga.
  select * into v_acc from public.enable_church_self_payment(
    '7d7d7d7d-0000-4000-8000-00000000000a', 'person', 'Pastor A', 'rls-selfpay-a@test.local', null, '11144477735');
  if v_acc.id is null or not v_acc.is_self_payment or v_acc.user_id is not null then
    raise exception 'FALHA autopat: conta nao nasceu como autopatrocinio sem dono pessoal';
  end if;

  -- Repetir reaproveita a mesma conta e não duplica a sponsorship.
  perform public.enable_church_self_payment(
    '7d7d7d7d-0000-4000-8000-00000000000a', 'person', 'Pastor A', 'rls-selfpay-a@test.local', null, '11144477735');
  select count(*) into n from public.sponsorships where sponsor_id = v_acc.id;
  if n <> 1 then raise exception 'FALHA autopat: religar duplicou a sponsorship (tem %)', n; end if;

  -- Sem patrocinador de verdade, fecha a porta (conferido no próximo bloco).
  perform public.set_church_aceita_patrocinio('7d7d7d7d-0000-4000-8000-00000000000a', false);
end $$;

do $$
begin
  if (select aceita_patrocinio from public.churches where id = '7d7d7d7d-0000-4000-8000-00000000000a') then
    raise exception 'FALHA autopat: fechar a porta nao gravou';
  end if;
  -- Escrita direta na coluna (sem passar pela RPC) tem que ser recusada: o
  -- GRANT de update de churches para authenticated não inclui esta coluna.
  begin
    update public.churches set aceita_patrocinio = true where id = '7d7d7d7d-0000-4000-8000-00000000000a';
    raise exception 'FALHA autopat: escreveu aceita_patrocinio sem passar pela RPC';
  exception when sqlstate '42501' then null;
  end;
end $$;

reset role;

-- Igreja B não enxerga a conta de autopatrocínio de A.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-00000000000b","email":"rls-selfpay-b@test.local","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.sponsor_accounts
  where church_id = '7d7d7d7d-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'FALHA autopat: igreja B leu a conta de autopatrocinio de A'; end if;
end $$;
reset role;

-- Um patrocinador de VERDADE entra: o gatilho cancela o autopatrocínio na
-- hora (nunca foi cobrado — pending_payment vira canceled, sem "fim de
-- ciclo"). Depois, nem religar nem fechar a porta são mais permitidos.
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('5e5e5e5e-0000-4000-8000-00000000000c', 'rls-selfpay-real@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Patrocinador de A"}');
insert into public.sponsor_accounts (id, user_id, kind, display_name, email, document, billing_status)
values ('8a8a8a8a-0000-4000-8000-00000000000a', '5e5e5e5e-0000-4000-8000-00000000000c',
        'business', 'Patrocinador de A', 'rls-selfpay-real@test.local', '11222333000181', 'active');
insert into public.sponsorships (sponsor_id, church_id, company_id, status)
values ('8a8a8a8a-0000-4000-8000-00000000000a', '7d7d7d7d-0000-4000-8000-00000000000a',
        '6c6c6c6c-0000-4000-8000-00000000000a', 'pending_payment');

do $$
declare v_status text;
begin
  select s.status into v_status
  from public.sponsorships s
  join public.sponsor_accounts a on a.id = s.sponsor_id
  where a.is_self_payment and a.church_id = '7d7d7d7d-0000-4000-8000-00000000000a';
  if v_status <> 'canceled' then
    raise exception 'FALHA autopat: patrocinador de verdade nao cancelou o autopatrocinio (status %)', v_status;
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-00000000000a","email":"rls-selfpay-a@test.local","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.enable_church_self_payment(
      '7d7d7d7d-0000-4000-8000-00000000000a', 'person', 'Pastor A', 'rls-selfpay-a@test.local', null, '11144477735');
    raise exception 'FALHA autopat: religou com patrocinador de verdade ativo';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.set_church_aceita_patrocinio('7d7d7d7d-0000-4000-8000-00000000000a', false);
    raise exception 'FALHA autopat: fechou a porta com patrocinador de verdade ativo';
  exception when sqlstate 'P0001' then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Vagas de primeiro patrocínio (migration 20260922110000)
-- ---------------------------------------------------------------------------
-- A congregação A passa a ter a única vaga ocupada.
update public.sponsorships set primeiro = true
where church_id = '7d7d7d7d-0000-4000-8000-000000000004';

insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('5e5e5e5e-0000-4000-8000-000000000009', 'rls-patro3@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Patrocinador da fila"}');
insert into public.sponsor_accounts (id, user_id, kind, display_name, email, document, billing_status)
values ('8a8a8a8a-0000-4000-8000-000000000002', '5e5e5e5e-0000-4000-8000-000000000009',
        'business', 'Patrocinador da Fila', 'rls-patro3@test.local', '44555666000114', 'active');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000009","email":"rls-patro3@test.local","role":"authenticated"}', true);

do $$
declare v_slots record; n int;
begin
  select * into v_slots from public.church_primeiro_slots('7d7d7d7d-0000-4000-8000-000000000004');
  if v_slots.limite <> 1 or v_slots.ocupadas <> 1 then
    raise exception 'FALHA vagas: congregacao A com limite % e ocupadas %', v_slots.limite, v_slots.ocupadas;
  end if;

  -- Primeiro patrocínio numa igreja lotada: barrado.
  begin
    perform public.request_sponsorship('7d7d7d7d-0000-4000-8000-000000000004');
    raise exception 'FALHA vagas: primeiro patrocinio entrou em igreja lotada';
  exception when sqlstate '23514' then null;
  end;

  -- Numa congregação com vaga, entra — e nasce marcado como primeiro.
  perform public.request_sponsorship('7d7d7d7d-0000-4000-8000-000000000005');
  select count(*) into n from public.sponsorships
  where sponsor_id = '8a8a8a8a-0000-4000-8000-000000000002' and primeiro;
  if n <> 1 then raise exception 'FALHA vagas: o primeiro patrocinio nao foi marcado'; end if;

  -- EXPANSÃO para a igreja lotada: permitida, porque não ocupa vaga.
  perform public.request_sponsorship('7d7d7d7d-0000-4000-8000-000000000004');
  select count(*) into n from public.sponsorships
  where sponsor_id = '8a8a8a8a-0000-4000-8000-000000000002'
    and church_id = '7d7d7d7d-0000-4000-8000-000000000004' and not primeiro;
  if n <> 1 then raise exception 'FALHA vagas: expansao barrada em igreja lotada'; end if;

  select * into v_slots from public.church_primeiro_slots('7d7d7d7d-0000-4000-8000-000000000004');
  if v_slots.ocupadas <> 1 then raise exception 'FALHA vagas: expansao ocupou vaga'; end if;
end $$;

-- Limite de volta para ilimitado: a fila abre de novo, sem tocar em nada.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000007","email":"rls-staff2@test.local","role":"authenticated"}', true);
do $$
begin
  perform public.platform_update_settings(null, null, null, 15);
end $$;

reset role;
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('5e5e5e5e-0000-4000-8000-00000000002a', 'rls-patro4@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Patrocinador sem limite"}');
insert into public.sponsor_accounts (id, user_id, kind, display_name, email, document, billing_status)
values ('8a8a8a8a-0000-4000-8000-000000000003', '5e5e5e5e-0000-4000-8000-00000000002a',
        'business', 'Sem Limite', 'rls-patro4@test.local', '55666777000125', 'active');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-00000000002a","email":"rls-patro4@test.local","role":"authenticated"}', true);
do $$
declare v_slots record;
begin
  select * into v_slots from public.church_primeiro_slots('7d7d7d7d-0000-4000-8000-000000000004');
  if v_slots.limite is not null then raise exception 'FALHA vagas: limite deveria ser ilimitado'; end if;
  perform public.request_sponsorship('7d7d7d7d-0000-4000-8000-000000000004');
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Carência da marca na vitrine (migration 20260922110000)
-- ---------------------------------------------------------------------------
-- O patrocinador da congregação A fica com uma cobrança vencida há 40 dias.
insert into public.sponsor_charges (sponsor_id, gateway, gateway_payment_id, amount_cents, active_count, due_date, status)
values ('8a8a8a8a-0000-4000-8000-000000000001', 'fake', 'pay_rls_atraso', 3990, 1, current_date - 40, 'overdue');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.list_church_sponsors('7d7d7d7d-0000-4000-8000-000000000004')
  where display_name = 'Patrocinador Arvore';
  if n <> 0 then raise exception 'FALHA carencia: marca atrasada ha 40 dias continua na vitrine'; end if;
end $$;

-- Carência de 60 dias: a mesma marca volta NA HORA, sem reprocessar nada.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000007","email":"rls-staff2@test.local","role":"authenticated"}', true);
do $$
begin
  perform public.platform_update_settings(null, null, null, 60);
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.list_church_sponsors('7d7d7d7d-0000-4000-8000-000000000004')
  where display_name = 'Patrocinador Arvore';
  if n <> 1 then raise exception 'FALHA carencia: aumentar a carencia nao devolveu a marca'; end if;
end $$;

-- Volta para 15 e o pagamento é confirmado (como faria o webhook): a marca
-- volta sozinha, sem ninguém mexer no patrocínio.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000007","email":"rls-staff2@test.local","role":"authenticated"}', true);
do $$
begin
  perform public.platform_update_settings(null, null, null, 15);
end $$;

reset role;
update public.sponsor_charges set status = 'paid', paid_at = now()
where gateway_payment_id = 'pay_rls_atraso';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.list_church_sponsors('7d7d7d7d-0000-4000-8000-000000000004')
  where display_name = 'Patrocinador Arvore';
  if n <> 1 then raise exception 'FALHA carencia: pagou e a marca nao voltou'; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- "Copiei a chave PIX" (migration 20260922130000)
-- ---------------------------------------------------------------------------
insert into public.church_pix_copies (church_id) values ('7d7d7d7d-0000-4000-8000-000000000004');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    insert into public.church_pix_copies (church_id) values ('7d7d7d7d-0000-4000-8000-000000000004');
    raise exception 'FALHA pix: anon gravou copia da chave';
  exception when sqlstate '42501' then null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000005","email":"rls-congb@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  -- Congregação B não vê o que é da congregação A.
  select count(*) into n from public.church_pix_copies;
  if n <> 0 then raise exception 'FALHA pix: congregacao B viu % copias alheias', n; end if;
  begin
    perform * from public.platform_pix_copies_by_week(8);
    raise exception 'FALHA pix: igreja leu a metrica da plataforma';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- A igreja da chave vê o próprio número; a subsede acima também.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000002","email":"rls-subx@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.church_pix_copies;
  if n <> 1 then raise exception 'FALHA pix: subsede X viu % copias (esperado 1, da congregacao dela)', n; end if;
end $$;

-- A igreja escreve a própria chave PIX; a de outra igreja, não.
do $$
declare n int;
begin
  update public.churches set pix_chave = 'chave@subx', pix_titular = 'Igreja Sub X'
  where id = '7d7d7d7d-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA pix: dona nao conseguiu gravar a propria chave'; end if;

  update public.churches set pix_chave = 'chave@roubada'
  where id = '7d7d7d7d-0000-4000-8000-000000000005';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA pix: igreja gravou a chave de outra'; end if;
end $$;

-- Member não mexe na chave PIX (é por ela que a doação entra).
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000006","email":"rls-membx@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.churches set pix_chave = 'chave@member'
  where id = '7d7d7d7d-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA pix: member trocou a chave da igreja'; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Onboarding: a igreja que o pastor cria sozinho entra fora da árvore
-- ---------------------------------------------------------------------------
-- Ela nasce `subsede` sem pai: não aparece para ninguém além dela mesma, e é
-- a plataforma que depois a coloca no lugar certo.
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('5e5e5e5e-0000-4000-8000-00000000002b', 'rls-novo@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Pastor novo"}');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-00000000002b","email":"rls-novo@test.local","role":"authenticated"}', true);
do $$
begin
  perform public.create_company_with_church('Igreja da Arvore RLS', 'rls-onboarding-arvore');
end $$;

reset role;
do $$
declare v_church public.churches;
begin
  select * into v_church from public.churches where slug like 'rls-onboarding-arvore%';
  if v_church.tipo <> 'subsede' then
    raise exception 'FALHA onboarding: igreja nasceu com tipo %', v_church.tipo;
  end if;
  if v_church.parent_id is not null then
    raise exception 'FALHA onboarding: igreja nasceu pendurada em alguem';
  end if;
  if v_church.path::text <> v_church.slug then
    raise exception 'FALHA onboarding: path inesperado (%)', v_church.path::text;
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000001","email":"rls-sede@test.local","role":"authenticated"}', true);
do $$
declare v_id uuid;
begin
  select id into v_id from public.churches where slug like 'rls-onboarding-arvore%';
  if public.can_view_church(v_id) then
    raise exception 'FALHA onboarding: igreja recem-criada ja aparece para a sede';
  end if;
end $$;

-- A plataforma põe a igreja no lugar; só então a sede a enxerga.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000007","email":"rls-staff2@test.local","role":"authenticated"}', true);
do $$
declare v_id uuid;
begin
  select id into v_id from public.churches where slug like 'rls-onboarding-arvore%';
  perform public.platform_set_church_hierarchy(v_id, 'congregacao', '7d7d7d7d-0000-4000-8000-000000000002');
end $$;

select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000001","email":"rls-sede@test.local","role":"authenticated"}', true);
do $$
declare v_id uuid;
begin
  select id into v_id from public.churches where slug like 'rls-onboarding-arvore%';
  if not public.can_view_church(v_id) then
    raise exception 'FALHA onboarding: igreja ligada continua invisivel para a sede';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Página da igreja: quem administra edita a própria (migration 20260923100000)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000002","email":"rls-subx@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- A própria igreja: nome, endereço, redes e endereço público.
  update public.churches
  set nome_proprio = 'Sub X Renomeada',
      address = 'Rua Nova, 100',
      social_links = '{"instagram":"@subx"}'::jsonb,
      public_code = 'rls-arv-subx-novo'
  where id = '7d7d7d7d-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA perfil: dona nao editou a propria pagina'; end if;

  -- A da congregação abaixo dela: a árvore dá leitura, não escrita.
  update public.churches set nome_proprio = 'Invadida'
  where id = '7d7d7d7d-0000-4000-8000-000000000004';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA perfil: subsede editou a pagina da congregacao'; end if;

  -- Endereço público repetido: o índice único recusa.
  begin
    update public.churches set public_code = 'rls-arv-congb'
    where id = '7d7d7d7d-0000-4000-8000-000000000002';
    raise exception 'FALHA perfil: dois enderecos publicos iguais foram aceitos';
  exception when sqlstate '23505' then null;
  end;

  -- Formato que não vira URL: o CHECK recusa.
  begin
    update public.churches set public_code = 'Endereço Com Espaço'
    where id = '7d7d7d7d-0000-4000-8000-000000000002';
    raise exception 'FALHA perfil: endereco publico invalido foi aceito';
  exception when sqlstate '23514' then null;
  end;

  -- Colunas que continuam fora do alcance do client.
  begin
    update public.churches set slug = 'outro-slug'
    where id = '7d7d7d7d-0000-4000-8000-000000000002';
    raise exception 'FALHA perfil: admin alterou o slug (base do path da arvore)';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- Member não edita a página nem troca o endereço público.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000006","email":"rls-membx@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.churches set nome_proprio = 'Member mandou'
  where id = '7d7d7d7d-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA perfil: member editou a pagina da igreja'; end if;
end $$;

-- Logo: cada igreja escreve só na própria pasta do bucket.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000002","email":"rls-subx@test.local","role":"authenticated"}', true);
do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('church-logos', '7d7d7d7d-0000-4000-8000-000000000002/logo.png');

  -- Na pasta da congregação abaixo: a sede/subsede não publica logo por cima
  -- de quem está abaixo dela.
  begin
    insert into storage.objects (bucket_id, name)
    values ('church-logos', '7d7d7d7d-0000-4000-8000-000000000004/logo.png');
    raise exception 'FALHA logo: subsede escreveu na pasta da congregacao';
  exception when sqlstate '42501' then null;
  end;

  -- Pasta que não é id de igreja nenhuma.
  begin
    insert into storage.objects (bucket_id, name)
    values ('church-logos', 'qualquer-coisa/logo.png');
    raise exception 'FALHA logo: pasta fora do padrao foi aceita';
  exception when sqlstate '42501' then null;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Recebimento por cartão: subconta da igreja (migration 20260924100000)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000002","email":"rls-subx@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- A igreja preenche o cadastro da PRÓPRIA conta.
  insert into public.church_payment_accounts (church_id, razao_social, documento, email, cidade, uf)
  values ('7d7d7d7d-0000-4000-8000-000000000002', 'Associacao Sub X', '11222333000181',
          'tesouraria@subx.test', 'Lins', 'SP');

  -- A conta de outra igreja, não.
  begin
    insert into public.church_payment_accounts (church_id, razao_social, documento)
    values ('7d7d7d7d-0000-4000-8000-000000000005', 'Invasora', '11222333000181');
    raise exception 'FALHA recebimento: igreja criou conta para outra';
  exception when sqlstate '42501' then null;
  end;

  -- Quem aprova é o provedor: `status` não tem GRANT de escrita.
  begin
    update public.church_payment_accounts set status = 'aprovada'
    where church_id = '7d7d7d7d-0000-4000-8000-000000000002';
    raise exception 'FALHA recebimento: igreja se aprovou sozinha';
  exception when sqlstate '42501' then null;
  end;

  -- Os segredos da subconta não são nem legíveis nem graváveis pelo client.
  begin
    perform api_key_cifrada from public.church_payment_accounts
    where church_id = '7d7d7d7d-0000-4000-8000-000000000002';
    raise exception 'FALHA recebimento: igreja leu a chave da subconta';
  exception when sqlstate '42501' then null;
  end;
  begin
    update public.church_payment_accounts set api_key_cifrada = 'minha'
    where church_id = '7d7d7d7d-0000-4000-8000-000000000002';
    raise exception 'FALHA recebimento: igreja gravou a chave da subconta';
  exception when sqlstate '42501' then null;
  end;
  begin
    update public.church_payment_accounts set webhook_token_hash = 'meu'
    where church_id = '7d7d7d7d-0000-4000-8000-000000000002';
    raise exception 'FALHA recebimento: igreja gravou o token do webhook';
  exception when sqlstate '42501' then null;
  end;

  -- Ligar o cartão é escolha dela (só vale com a conta aprovada; quem confere
  -- isso é o service).
  update public.church_payment_accounts set aceita_cartao = true
  where church_id = '7d7d7d7d-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA recebimento: igreja nao ligou o proprio cartao'; end if;
end $$;

-- Member não enxerga nem configura conta de recebimento.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000006","email":"rls-membx@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.church_payment_accounts;
  if n <> 0 then raise exception 'FALHA recebimento: member viu % contas', n; end if;
end $$;

-- Congregação B (outra empresa) não vê a conta da subsede X.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000005","email":"rls-congb@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.church_payment_accounts;
  if n <> 0 then raise exception 'FALHA recebimento: outra igreja viu % contas', n; end if;
end $$;

reset role;

-- O botão do cartão na página pública só existe com conta APROVADA, escolha
-- da igreja e link pronto — as três coisas.
update public.church_payment_accounts
set status = 'aprovada', link_doacao_cartao = 'https://pagamento.exemplo/doar/subx'
where church_id = '7d7d7d7d-0000-4000-8000-000000000002';

insert into public.church_donations (church_id, provider, external_payment_id, amount_cents, metodo, status, paga_em)
values ('7d7d7d7d-0000-4000-8000-000000000002', 'fake', 'pay_rls_doacao', 5000, 'cartao', 'recebida', now());

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare v_link text;
begin
  select public.church_card_donation_link('7d7d7d7d-0000-4000-8000-000000000002') into v_link;
  if v_link is distinct from 'https://pagamento.exemplo/doar/subx' then
    raise exception 'FALHA recebimento: pagina publica nao recebeu o link (%)', coalesce(v_link, '<null>');
  end if;

  -- Igreja sem conta aprovada não devolve link nenhum.
  select public.church_card_donation_link('7d7d7d7d-0000-4000-8000-000000000004') into v_link;
  if v_link is not null then raise exception 'FALHA recebimento: igreja sem conta devolveu link'; end if;

  -- A tabela em si continua fechada para o anon.
  begin
    perform 1 from public.church_payment_accounts;
    raise exception 'FALHA recebimento: anon leu as contas de recebimento';
  exception when sqlstate '42501' then null;
  end;

  -- Doação só entra pelo webhook (service_role).
  begin
    insert into public.church_donations (church_id, provider, external_payment_id, amount_cents, status)
    values ('7d7d7d7d-0000-4000-8000-000000000002', 'fake', 'pay_falso', 100, 'recebida');
    raise exception 'FALHA doacao: anon gravou doacao';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- Desligando o cartão, o botão some da página na hora.
reset role;
update public.church_payment_accounts set aceita_cartao = false
where church_id = '7d7d7d7d-0000-4000-8000-000000000002';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare v_link text;
begin
  select public.church_card_donation_link('7d7d7d7d-0000-4000-8000-000000000002') into v_link;
  if v_link is not null then
    raise exception 'FALHA recebimento: cartao desligado continua na pagina';
  end if;
end $$;

-- A igreja lê as próprias doações; a sede, pela árvore; outra igreja, não.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000002","email":"rls-subx@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.church_donations;
  if n <> 1 then raise exception 'FALHA doacao: a igreja viu % doacoes (esperado 1)', n; end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000001","email":"rls-sede@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.church_donations;
  if n <> 1 then raise exception 'FALHA doacao: a sede viu % doacoes da subsede (esperado 1)', n; end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000003","email":"rls-suby@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.church_donations;
  if n <> 0 then raise exception 'FALHA doacao: subsede Y viu doacao da irma X'; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- "Já vi": badge de pedidos de oração não visualizados (migration
-- 20260925100000). Reaproveita a árvore acima (Sub X com um pedido, dono e
-- member) e ganha um SEGUNDO admin, para provar que a marca é POR PESSOA.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('5e5e5e5e-0000-4000-8000-00000000001c', 'rls-subx2@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Segundo admin de X"}');
insert into public.company_members (company_id, user_id, role) values
  ('6c6c6c6c-0000-4000-8000-000000000002', '5e5e5e5e-0000-4000-8000-00000000001c', 'admin');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform public.mark_prayer_requests_seen('6c6c6c6c-0000-4000-8000-000000000002', now());
    raise exception 'FALHA visto: anon chamou a RPC de marcar como visto';
  exception when sqlstate '42501' then null; -- sem GRANT de execute
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000006","email":"rls-membx@test.local","role":"authenticated"}', true);
do $$
begin
  -- Member não administra a empresa: não faz sentido existir marca de
  -- "visto" para quem nem acessa a tela dos pedidos.
  begin
    perform public.mark_prayer_requests_seen('6c6c6c6c-0000-4000-8000-000000000002', now());
    raise exception 'FALHA visto: member marcou pedidos como vistos';
  exception when sqlstate '42501' then null;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000004","email":"rls-conga@test.local","role":"authenticated"}', true);
do $$
begin
  -- Admin de OUTRA empresa não marca "visto" na caixa alheia.
  begin
    perform public.mark_prayer_requests_seen('6c6c6c6c-0000-4000-8000-000000000002', now());
    raise exception 'FALHA visto: admin de outra empresa marcou pedidos de Sub X como vistos';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- O dono de Sub X marca "vi até 1 hora atrás" — antes do pedido da fixture
-- (inserido nesta mesma transação, logo com created_at = now() da transação).
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000002","email":"rls-subx@test.local","role":"authenticated"}', true);
do $$
declare n int; v_seen timestamptz;
begin
  perform public.mark_prayer_requests_seen(
    '6c6c6c6c-0000-4000-8000-000000000002', now() - interval '1 hour');

  select count(*) into n from public.prayer_requests_last_seen;
  if n <> 1 then raise exception 'FALHA visto: dono nao ve a propria marca (viu %)', n; end if;

  -- Direto na tabela, sem passar pela RPC: sem GRANT de insert/update, só a
  -- RPC escreve.
  begin
    insert into public.prayer_requests_last_seen (user_id, company_id, seen_at)
    values (auth.uid(), '6c6c6c6c-0000-4000-8000-000000000002', now());
    raise exception 'FALHA visto: insert direto na tabela foi aceito';
  exception when sqlstate '42501' then null;
  end;
  begin
    update public.prayer_requests_last_seen set seen_at = now();
    raise exception 'FALHA visto: update direto na tabela foi aceito';
  exception when sqlstate '42501' then null;
  end;

  -- Chamar de novo com uma marca MAIS ANTIGA não pode regredir (duas abas
  -- abertas, ou um clique duplicado, não podem devolver pedido a "não lido").
  perform public.mark_prayer_requests_seen(
    '6c6c6c6c-0000-4000-8000-000000000002', now() - interval '2 hours');
  select seen_at into v_seen from public.prayer_requests_last_seen;
  if v_seen <> (now() - interval '1 hour') then
    raise exception 'FALHA visto: marca regrediu com um valor mais antigo (%)', v_seen;
  end if;

  -- Uma marca MAIS NOVA, essa sim, avança.
  perform public.mark_prayer_requests_seen(
    '6c6c6c6c-0000-4000-8000-000000000002', now() + interval '1 hour');
  select seen_at into v_seen from public.prayer_requests_last_seen;
  if v_seen <> (now() + interval '1 hour') then
    raise exception 'FALHA visto: marca nao avancou com um valor mais novo (%)', v_seen;
  end if;
end $$;

-- O SEGUNDO admin de Sub X não tem marca nenhuma: a de quem já viu é PESSOAL,
-- não da empresa. Ele ainda não abriu a tela, então tudo conta como novo
-- para ele.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-00000000001c","email":"rls-subx2@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.prayer_requests_last_seen;
  if n <> 0 then
    raise exception 'FALHA visto: a marca do primeiro admin vazou para o segundo (viu %)', n;
  end if;

  perform public.mark_prayer_requests_seen('6c6c6c6c-0000-4000-8000-000000000002', now());
  select count(*) into n from public.prayer_requests_last_seen;
  if n <> 1 then raise exception 'FALHA visto: segundo admin nao conseguiu marcar a propria'; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Campanhas: rascunho não é público, dono edita, outro tenant não alcança,
-- doação nasce só pela função, e a confirmação PIX soma o total uma vez só.
-- ---------------------------------------------------------------------------
-- Fixture com id explícito: roda antes do role switch (mesmo motivo das
-- igrejas no topo do arquivo — o GRANT de insert de authenticated não inclui
-- `id`, só o superuser desta seção de setup escreve id escolhido).
insert into public.campaigns (id, church_id, titulo, historia, meta_cents, metodo_recebimento) values
  ('7a7a7a7a-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 'Reforma do telhado', 'Precisamos trocar o telhado antes das chuvas.', 500000, 'pix'),
  ('7a7a7a7a-0000-4000-8000-000000000002', 'd1d1d1d1-0000-4000-8000-000000000001', 'Cartão da campanha', 'Campanha para testar o caminho do cartão.', 300000, 'gateway');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);

do $$
begin
  if (select status from public.campaigns where id = '7a7a7a7a-0000-4000-8000-000000000001') <> 'rascunho' then
    raise exception 'FALHA campanha: deveria nascer em rascunho';
  end if;
end $$;

-- Bob (outra empresa) não cria campanha na igreja da Alice, nem vê o rascunho.
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.campaigns (church_id, titulo, historia, meta_cents, metodo_recebimento)
    values ('d1d1d1d1-0000-4000-8000-000000000001', 'Invasão', 'Tentativa de outro tenant.', 100, 'pix');
    raise exception 'FALHA campanha: bob criou campanha na igreja da alice';
  exception when sqlstate '42501' then null; -- esperado
  end;

  perform 1 from public.campaigns where id = '7a7a7a7a-0000-4000-8000-000000000001';
  if found then
    raise exception 'FALHA campanha: bob enxergou rascunho de outro tenant';
  end if;
end $$;

-- Alice ativa as duas campanhas.
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);
update public.campaigns set status = 'ativa'
where id in ('7a7a7a7a-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002');

-- Ninguém escreve o total direto: a coluna nem está no GRANT de authenticated.
do $$
begin
  begin
    update public.campaigns set total_arrecadado_liquido_cents = 999999
    where id = '7a7a7a7a-0000-4000-8000-000000000001';
    raise exception 'FALHA campanha: alice escreveu o total direto pela coluna';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

-- Bob não edita a campanha ativa da Alice.
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);
do $$
begin
  update public.campaigns set titulo = 'sequestrada' where id = '7a7a7a7a-0000-4000-8000-000000000001';
  if found then
    raise exception 'FALHA campanha: bob editou campanha ativa de outro tenant';
  end if;
end $$;

-- Anônimo enxerga a campanha ativa (é para isso que ela existe), mas não
-- alcança a tabela de doações de jeito nenhum — nem GRANT de select existe
-- para o papel, então nem precisa de doação de verdade para provar isso.
set local role anon;
do $$
begin
  perform 1 from public.campaigns where id = '7a7a7a7a-0000-4000-8000-000000000001';
  if not found then
    raise exception 'FALHA campanha: anon nao viu campanha ativa';
  end if;

  begin
    perform 1 from public.campaign_donations where id = '00000000-0000-0000-0000-000000000000';
    raise exception 'FALHA doacao: anon leu a tabela de doacoes';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

-- Doação: só pela função, nunca INSERT direto; validação de nome/valor
-- acontece antes de tocar o banco; e a função recusa método fora do
-- combinado pela campanha (pix numa campanha de cartão, e vice-versa).
-- Volta para `authenticated`: o bloco anterior deixou a sessão como `anon`,
-- e a tabela temporária abaixo precisa ficar com um dono que a sessão
-- seguinte (também `authenticated`) ainda consiga ler.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);
do $$
declare
  v_doacao_pix uuid;
  v_doacao_gateway uuid;
begin
  begin
    insert into public.campaign_donations (campaign_id, doador_nome, doador_telefone, valor_bruto_cents, metodo)
    values ('7a7a7a7a-0000-4000-8000-000000000001', 'Fulano', '11999999999', 1000, 'pix');
    raise exception 'FALHA doacao: insert direto na tabela foi aceito';
  exception when sqlstate '42501' then null; -- esperado
  end;

  begin
    perform public.criar_doacao_pix_campanha('7a7a7a7a-0000-4000-8000-000000000001', 'A', '11999999999', 1000);
    raise exception 'FALHA doacao: nome de 1 letra foi aceito';
  exception when sqlstate 'P0001' then null; -- esperado
  end;

  begin
    perform public.criar_doacao_pix_campanha('7a7a7a7a-0000-4000-8000-000000000002', 'Fulano de Tal', '11999999999', 1000);
    raise exception 'FALHA doacao: pix aceito numa campanha de cartao';
  exception when sqlstate 'P0001' then null; -- esperado
  end;

  begin
    perform public.registrar_doacao_gateway_campanha('7a7a7a7a-0000-4000-8000-000000000001', 'Fulano de Tal', null, 1000);
    raise exception 'FALHA doacao: cartao aceito numa campanha pix';
  exception when sqlstate 'P0001' then null; -- esperado
  end;

  v_doacao_pix := public.criar_doacao_pix_campanha(
    '7a7a7a7a-0000-4000-8000-000000000001', 'Fulano de Tal', '11999999999', 15000);
  v_doacao_gateway := public.registrar_doacao_gateway_campanha(
    '7a7a7a7a-0000-4000-8000-000000000002', 'Ciclana', null, 8000);
  if v_doacao_pix is null or v_doacao_gateway is null then
    raise exception 'FALHA doacao: funcao nao devolveu id';
  end if;

  -- Guarda os ids numa tabela temporária: DO blocks não compartilham escopo.
  create temp table if not exists rls_tmp_campanha_ids (chave text primary key, valor uuid);
  insert into rls_tmp_campanha_ids values ('pix', v_doacao_pix), ('gateway', v_doacao_gateway)
  on conflict (chave) do update set valor = excluded.valor;
end $$;

-- Bob (outra empresa) não confirma a doação PIX da campanha da Alice.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-4000-8000-000000000002","email":"rls-bob@test.local","role":"authenticated"}', true);
do $$
declare v_doacao_pix uuid;
begin
  select valor into v_doacao_pix from rls_tmp_campanha_ids where chave = 'pix';
  begin
    perform public.confirmar_doacao_pix(v_doacao_pix);
    raise exception 'FALHA doacao: bob confirmou doacao de outro tenant';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

-- Alice confirma a própria doação PIX: soma no total, e confirmar de novo
-- (duplo clique, ou corrida entre duas abas) não soma outra vez.
select set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","email":"rls-alice@test.local","role":"authenticated"}', true);
do $$
declare
  v_doacao_pix uuid;
  v_doacao_gateway uuid;
  v_total int;
  v_status text;
begin
  select valor into v_doacao_pix from rls_tmp_campanha_ids where chave = 'pix';
  select valor into v_doacao_gateway from rls_tmp_campanha_ids where chave = 'gateway';

  -- Confirmar uma doação de cartão pela função de PIX é recusado: são
  -- caminhos diferentes de propósito (cartão confirma sozinho, no webhook).
  begin
    perform public.confirmar_doacao_pix(v_doacao_gateway);
    raise exception 'FALHA doacao: confirmar_doacao_pix aceitou uma doacao de cartao';
  exception when sqlstate 'P0001' then null; -- esperado
  end;

  perform public.confirmar_doacao_pix(v_doacao_pix);
  select total_arrecadado_liquido_cents into v_total
  from public.campaigns where id = '7a7a7a7a-0000-4000-8000-000000000001';
  if v_total <> 15000 then
    raise exception 'FALHA doacao: total nao subiu o valor da doacao confirmada (veio %)', v_total;
  end if;

  select status into v_status from public.campaign_donations where id = v_doacao_pix;
  if v_status <> 'confirmada' then
    raise exception 'FALHA doacao: status nao virou confirmada (veio %)', v_status;
  end if;

  -- Confirmar de novo: idempotente, o total não muda.
  perform public.confirmar_doacao_pix(v_doacao_pix);
  select total_arrecadado_liquido_cents into v_total
  from public.campaigns where id = '7a7a7a7a-0000-4000-8000-000000000001';
  if v_total <> 15000 then
    raise exception 'FALHA doacao: confirmar duas vezes somou o valor duas vezes (veio %)', v_total;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Herança do tema E da cor pela árvore (migration 20260926110000).
--
-- Quem herda usa tema e cor da igreja-mãe mais próxima que personalizou.
-- Herdar só o tema deixaria a congregação com a cor errada.
-- ---------------------------------------------------------------------------
reset role;

update public.churches
set template_mode = 'custom',
    template_id = (select id from public.templates where slug = 'clean'),
    accent_color = '#be123c'
where id = '7d7d7d7d-0000-4000-8000-000000000001'; -- Sede

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare v_tema uuid; v_cor text;
begin
  -- Sub Y e Cong B (Sede > Sub Y > Cong B) herdam da Sede.
  select template_id, accent_color into v_tema, v_cor
  from public.resolve_church_appearance('7d7d7d7d-0000-4000-8000-000000000005');
  if v_tema is distinct from (select id from public.templates where slug = 'clean') or v_cor is distinct from '#be123c' then
    raise exception 'FALHA herdar aparencia: Cong B nao herdou tema+cor da Sede (%/%)', coalesce(v_tema::text, '<null>'), coalesce(v_cor, '<null>');
  end if;

  -- Cong A (Sede > Sub X > Cong A, ligada mais acima neste teste) herda
  -- da Sede por DOIS níveis.
  select template_id, accent_color into v_tema, v_cor
  from public.resolve_church_appearance('7d7d7d7d-0000-4000-8000-000000000004');
  if v_tema is distinct from (select id from public.templates where slug = 'clean') or v_cor is distinct from '#be123c' then
    raise exception 'FALHA herdar aparencia: Cong A nao herdou da Sede por dois niveis (%/%)', coalesce(v_tema::text, '<null>'), coalesce(v_cor, '<null>');
  end if;
end $$;

reset role;

-- Quem personaliza (custom) ganha os próprios; cor nula = cor padrão do tema.
update public.churches
set template_mode = 'custom',
    template_id = (select id from public.templates where slug = 'dark'),
    accent_color = null
where id = '7d7d7d7d-0000-4000-8000-000000000003'; -- Sub Y

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare v_tema uuid; v_cor text;
begin
  select template_id, accent_color into v_tema, v_cor
  from public.resolve_church_appearance('7d7d7d7d-0000-4000-8000-000000000005'); -- Cong B, agora herda da Sub Y
  if v_tema is distinct from (select id from public.templates where slug = 'dark') or v_cor is not null then
    raise exception 'FALHA herdar aparencia: Cong B nao seguiu a Sub Y mais proxima (%/%)', coalesce(v_tema::text, '<null>'), coalesce(v_cor, '<null>');
  end if;

  -- A outra ramificação não muda: Cong A segue herdando da Sede.
  select template_id, accent_color into v_tema, v_cor
  from public.resolve_church_appearance('7d7d7d7d-0000-4000-8000-000000000004');
  if v_tema is distinct from (select id from public.templates where slug = 'clean') or v_cor is distinct from '#be123c' then
    raise exception 'FALHA herdar aparencia: personalizar a Sub Y mexeu na ramificacao da Sub X';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Nome e sobrenome (migration 20260926120000).
--
-- `name` (o que aparece) deixou de ser escrito pelo client: quem escreve é
-- `nome_proprio`, e um trigger deriva `name` — do próprio, ou do da igreja
-- superior quando `herdar_nome`. Sobrenome é individual.
-- ---------------------------------------------------------------------------
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000003","email":"rls-suby@test.local","role":"authenticated"}', true);

do $$
begin
  -- `name` é derivado: o GRANT de escrita saiu.
  begin
    update public.churches set name = 'Direto' where id = '7d7d7d7d-0000-4000-8000-000000000003';
    raise exception 'FALHA nome: client ainda escreve name direto';
  exception when sqlstate '42501' then null; -- esperado
  end;

  update public.churches
  set nome_proprio = 'Sub Y Novo', sobrenome = 'Norte'
  where id = '7d7d7d7d-0000-4000-8000-000000000003';

  -- Outra empresa: a policy esconde a linha (0 linhas afetadas).
  update public.churches set nome_proprio = 'Invadida' where id = '7d7d7d7d-0000-4000-8000-000000000004';
end $$;

reset role;

do $$
declare v_nome text; v_sob text; v_outra text;
begin
  select name, sobrenome into v_nome, v_sob from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000003';
  if v_nome is distinct from 'Sub Y Novo' or v_sob is distinct from 'Norte' then
    raise exception 'FALHA nome: name nao acompanhou nome_proprio (%/%)', v_nome, v_sob;
  end if;
  select name into v_outra from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000004';
  if v_outra = 'Invadida' then
    raise exception 'FALHA nome: admin renomeou a igreja de OUTRA empresa';
  end if;
end $$;

-- Cong B (abaixo de Sub Y) passa a herdar o nome; o sobrenome dela continua dela.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000005","email":"rls-congb@test.local","role":"authenticated"}', true);

update public.churches set herdar_nome = true, sobrenome = 'Prainha'
where id = '7d7d7d7d-0000-4000-8000-000000000005';

reset role;

do $$
declare v_nome text; v_sob text;
begin
  select name, sobrenome into v_nome, v_sob from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000005';
  if v_nome is distinct from 'Sub Y Novo' or v_sob is distinct from 'Prainha' then
    raise exception 'FALHA nome: Cong B nao herdou o nome da Sub Y (%/%)', v_nome, v_sob;
  end if;
end $$;

-- A superior muda o nome: quem herda acompanha (o gatilho por coluna nao dispararia
-- aqui, porque `name` muda dentro de outro trigger — por isso o gatilho e por linha).
update public.churches set nome_proprio = 'Sub Y Final' where id = '7d7d7d7d-0000-4000-8000-000000000003';

do $$
declare v_nome text; v_proprio text;
begin
  select name, nome_proprio into v_nome, v_proprio from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000005';
  if v_nome is distinct from 'Sub Y Final' then
    raise exception 'FALHA nome: mudanca da superior nao chegou em quem herda (%)', v_nome;
  end if;
  if v_proprio is distinct from 'Cong B' then
    raise exception 'FALHA nome: o nome proprio de quem herda foi sobrescrito (%)', v_proprio;
  end if;
end $$;

-- Sem igreja superior nao ha o que herdar: o trigger derruba a marca.
update public.churches set herdar_nome = true where id = '7d7d7d7d-0000-4000-8000-000000000001';

do $$
declare v_herda boolean;
begin
  select herdar_nome into v_herda from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000001';
  if v_herda then raise exception 'FALHA nome: igreja sem superior ficou com herdar_nome'; end if;
end $$;

-- O visitante lê o sobrenome e monta o nome completo.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare v_sob text;
begin
  select sobrenome into v_sob from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000005';
  if v_sob is distinct from 'Prainha' then
    raise exception 'FALHA nome: anon nao le o sobrenome (%)', coalesce(v_sob, '<null>');
  end if;
  if public.church_full_name('AD Ipiranga', 'Prainha') <> 'AD Ipiranga · Prainha'
     or public.church_full_name('AD Ipiranga', '  ') <> 'AD Ipiranga' then
    raise exception 'FALHA nome: church_full_name inesperado';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Vínculo entre igrejas: link da superior + pedido aprovado por ela
-- (migration 20260926130000).
--
-- O link NÃO liga nada: gera um pedido, e só a aprovação da superior muda a
-- árvore. O que está sendo provado: quem pode gerar link; que pedir não muda
-- a árvore; que só a superior decide; que terceiros não leem link nem pedido
-- alheios; que a superior só move igrejas dentro da árvore dela; e que cada
-- passo avisa a outra ponta.
-- ---------------------------------------------------------------------------
reset role;

-- Cong B (abaixo de Sub Y) sai da árvore e fica independente.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000005","email":"rls-congb@test.local","role":"authenticated"}', true);

do $$
declare r record;
begin
  select * into r from public.end_church_link('7d7d7d7d-0000-4000-8000-000000000005');
  if r.other_company_id is distinct from '6c6c6c6c-0000-4000-8000-000000000003' then
    raise exception 'FALHA vinculo: end_church_link nao apontou a outra empresa (%)', r.other_company_id;
  end if;
  begin
    perform public.end_church_link('7d7d7d7d-0000-4000-8000-000000000005');
    raise exception 'FALHA vinculo: desfez vinculo que nao existia';
  exception when sqlstate 'P0001' then null; -- esperado
  end;
end $$;

reset role;

do $$
declare v_pai uuid; v_tipo text; v_herda boolean; v_nome text; n int;
begin
  select parent_id, tipo, herdar_nome, name into v_pai, v_tipo, v_herda, v_nome
  from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000005';
  if v_pai is not null or v_tipo <> 'subsede' then
    raise exception 'FALHA vinculo: Cong B nao ficou independente (%/%)', v_pai, v_tipo;
  end if;
  -- Sem superior, volta ao nome proprio.
  if v_herda or v_nome <> 'Cong B' then
    raise exception 'FALHA vinculo: nome nao voltou ao proprio ao sair (%)', v_nome;
  end if;
  select count(*) into n from public.church_link_notices
  where company_id = '6c6c6c6c-0000-4000-8000-000000000003' and kind = 'encerrado';
  if n <> 1 then raise exception 'FALHA vinculo: a outra ponta nao recebeu o aviso (% avisos)', n; end if;
end $$;

-- ------------------------- quem pode gerar link ----------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000003","email":"rls-suby@test.local","role":"authenticated"}', true);

do $$
declare v_id uuid;
begin
  -- Subsede que já tem superior só convida congregações.
  begin
    perform public.create_church_link_invite('7d7d7d7d-0000-4000-8000-000000000003', 'subsede',
      repeat('a', 64), now() + interval '30 days', 5);
    raise exception 'FALHA vinculo: subsede com superior gerou link de subsede';
  exception when sqlstate 'P0001' then null; -- esperado
  end;
  -- Em nome de igreja de OUTRA empresa: barrado.
  begin
    perform public.create_church_link_invite('7d7d7d7d-0000-4000-8000-000000000005', 'congregacao',
      repeat('b', 64), now() + interval '30 days', 5);
    raise exception 'FALHA vinculo: admin gerou link em nome de igreja alheia';
  exception when sqlstate '42501' then null; -- esperado
  end;
  -- Validade no passado e limite de usos absurdo.
  begin
    perform public.create_church_link_invite('7d7d7d7d-0000-4000-8000-000000000003', 'congregacao',
      repeat('d', 64), now() - interval '1 day', 5);
    raise exception 'FALHA vinculo: aceitou link ja vencido';
  exception when sqlstate 'P0001' then null; -- esperado
  end;
  begin
    perform public.create_church_link_invite('7d7d7d7d-0000-4000-8000-000000000003', 'congregacao',
      repeat('d', 64), now() + interval '30 days', 500);
    raise exception 'FALHA vinculo: aceitou limite de usos absurdo';
  exception when sqlstate 'P0001' then null; -- esperado
  end;

  -- O link valido: 1 uso, para congregacoes.
  v_id := public.create_church_link_invite('7d7d7d7d-0000-4000-8000-000000000003', 'congregacao',
    repeat('c', 64), now() + interval '30 days', 1);
  if v_id is null then raise exception 'FALHA vinculo: link nao foi criado'; end if;
end $$;

-- Member não gera link.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000006","email":"rls-membx@test.local","role":"authenticated"}', true);

do $$
begin
  begin
    perform public.create_church_link_invite('7d7d7d7d-0000-4000-8000-000000000002', 'congregacao',
      repeat('e', 64), now() + interval '30 days', 5);
    raise exception 'FALHA vinculo: member gerou link';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

-- Congregação não gera link, e um terceiro (Cong A) não lê link nem pedido alheio.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000004","email":"rls-conga@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  begin
    perform public.create_church_link_invite('7d7d7d7d-0000-4000-8000-000000000004', 'congregacao',
      repeat('f', 64), now() + interval '30 days', 5);
    raise exception 'FALHA vinculo: congregacao gerou link';
  exception when sqlstate 'P0001' then null; -- esperado
  end;

  select count(*) into n from public.church_link_invites;
  if n <> 0 then raise exception 'FALHA vinculo: terceiro leu % link(s) alheio(s)', n; end if;
  select count(*) into n from public.church_link_requests;
  if n <> 0 then raise exception 'FALHA vinculo: terceiro leu % pedido(s) alheio(s)', n; end if;
  begin
    perform token_hash from public.church_link_invites;
    raise exception 'FALHA vinculo: authenticated le token_hash';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- Nem pede em nome de uma igreja que nao e dele.
  begin
    perform public.request_church_link(repeat('c', 64), '7d7d7d7d-0000-4000-8000-000000000005');
    raise exception 'FALHA vinculo: terceiro pediu por igreja alheia';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

-- ---------------------- a igreja de baixo abre e PEDE -----------------------
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000005","email":"rls-congb@test.local","role":"authenticated"}', true);

do $$
declare n int; r record;
begin
  select count(*) into n from public.get_church_link_invite(repeat('c', 64)) where status = 'ativo' and not is_mine;
  if n <> 1 then raise exception 'FALHA vinculo: preview do link nao abriu para o destinatario'; end if;

  select * into r from public.request_church_link(repeat('c', 64), '7d7d7d7d-0000-4000-8000-000000000005');
  if r.parent_company_id is distinct from '6c6c6c6c-0000-4000-8000-000000000003' or r.tipo_solicitado <> 'congregacao' then
    raise exception 'FALHA vinculo: pedido com dados inesperados';
  end if;

  -- Um pedido pendente por igreja.
  begin
    perform public.request_church_link(repeat('c', 64), '7d7d7d7d-0000-4000-8000-000000000005');
    raise exception 'FALHA vinculo: segundo pedido pendente foi aceito';
  exception when sqlstate 'P0001' then null; -- esperado
  end;

  -- O link de 1 uso, ja usado, aparece esgotado.
  select count(*) into n from public.get_church_link_invite(repeat('c', 64)) where status = 'esgotado';
  if n <> 1 then raise exception 'FALHA vinculo: link esgotado nao foi reconhecido'; end if;

  -- Quem pediu enxerga o proprio pedido.
  select count(*) into n from public.church_link_requests where status = 'pendente';
  if n <> 1 then raise exception 'FALHA vinculo: quem pediu nao ve o proprio pedido'; end if;
end $$;

-- Anônimo não abre link.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform public.get_church_link_invite(repeat('c', 64));
    raise exception 'FALHA vinculo: anon abriu o link';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

reset role;

do $$
declare v_pai uuid; n int;
begin
  -- Pedir NAO muda a arvore, e a superior e avisada.
  select parent_id into v_pai from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000005';
  if v_pai is not null then raise exception 'FALHA vinculo: pedir ja ligou a igreja'; end if;
  select count(*) into n from public.church_link_notices
  where company_id = '6c6c6c6c-0000-4000-8000-000000000003' and kind = 'pedido';
  if n <> 1 then raise exception 'FALHA vinculo: a superior nao foi avisada do pedido'; end if;
end $$;

-- ------------------------- a superior DECIDE ------------------------------
-- A Sede (fora do pedido) não o enxerga; quem pediu não o aprova.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000001","email":"rls-sede@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.church_link_requests;
  if n <> 0 then raise exception 'FALHA vinculo: a sede leu % pedido(s) entre outras igrejas', n; end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000005","email":"rls-congb@test.local","role":"authenticated"}', true);

do $$
declare v_req uuid;
begin
  select id into v_req from public.church_link_requests where status = 'pendente';
  begin
    perform public.decide_church_link_request(v_req, true);
    raise exception 'FALHA vinculo: quem pediu aprovou o proprio pedido';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000003","email":"rls-suby@test.local","role":"authenticated"}', true);

do $$
declare v_req uuid; r record; v_pedidos int;
begin
  select id into v_req from public.church_link_requests where status = 'pendente';
  select count(*) into v_pedidos from public.church_link_requests where status = 'pendente';
  if v_pedidos <> 1 or v_req is null then raise exception 'FALHA vinculo: a superior nao ve o pedido'; end if;

  -- Ajustar a posicao para uma que a estrutura nao comporta: recusa clara, e nada muda.
  begin
    perform public.decide_church_link_request(v_req, true, 'subsede');
    raise exception 'FALHA vinculo: aprovou como subsede uma igreja cuja superior ja tem superior';
  exception when sqlstate 'P0001' then null; -- esperado
  end;

  select * into r from public.decide_church_link_request(v_req, true);
  if not r.aprovado or r.tipo <> 'congregacao' or r.child_company_id is distinct from '6c6c6c6c-0000-4000-8000-000000000005' then
    raise exception 'FALHA vinculo: aprovacao com dados inesperados';
  end if;

  -- Decidido uma vez so.
  begin
    perform public.decide_church_link_request(v_req, true);
    raise exception 'FALHA vinculo: pedido foi decidido duas vezes';
  exception when sqlstate 'P0001' then null; -- esperado
  end;
end $$;

reset role;

do $$
declare v_pai uuid; v_tipo text; n int;
begin
  select parent_id, tipo into v_pai, v_tipo from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000005';
  if v_pai is distinct from '7d7d7d7d-0000-4000-8000-000000000003' or v_tipo <> 'congregacao' then
    raise exception 'FALHA vinculo: a aprovacao nao religou a Cong B (%/%)', v_pai, v_tipo;
  end if;
  select count(*) into n from public.church_link_notices
  where company_id = '6c6c6c6c-0000-4000-8000-000000000005' and kind = 'aprovado';
  if n <> 1 then raise exception 'FALHA vinculo: quem pediu nao recebeu o aviso de aprovacao'; end if;
  select count(*) into n from public.audit_logs where action = 'church.link.approved' and entity_id = '7d7d7d7d-0000-4000-8000-000000000005';
  if n <> 1 then raise exception 'FALHA vinculo: aprovacao sem auditoria'; end if;
end $$;

-- ----------------------- revogar e mudar a posição -------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000003","email":"rls-suby@test.local","role":"authenticated"}', true);

do $$
declare v_id uuid;
begin
  v_id := public.create_church_link_invite('7d7d7d7d-0000-4000-8000-000000000003', 'congregacao',
    repeat('9', 64), now() + interval '30 days', 5);
  -- Outra empresa nao revoga; a dona revoga.
  perform set_config('request.jwt.claims',
    '{"sub":"5e5e5e5e-0000-4000-8000-000000000005","email":"rls-congb@test.local","role":"authenticated"}', true);
  begin
    perform public.revoke_church_link_invite(v_id);
    raise exception 'FALHA vinculo: outra empresa revogou link alheio';
  exception when sqlstate '42501' then null; -- esperado
  end;
  perform set_config('request.jwt.claims',
    '{"sub":"5e5e5e5e-0000-4000-8000-000000000003","email":"rls-suby@test.local","role":"authenticated"}', true);
  if not public.revoke_church_link_invite(v_id) then raise exception 'FALHA vinculo: a dona nao revogou o link'; end if;
  if (select status from public.get_church_link_invite(repeat('9', 64))) <> 'revogado' then
    raise exception 'FALHA vinculo: link revogado nao aparece como revogado';
  end if;
end $$;

-- A Sede move a Cong B (que esta sob a Sub Y) para debaixo dela: e a arvore dela.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000001","email":"rls-sede@test.local","role":"authenticated"}', true);

do $$
declare r record;
begin
  -- Nao coloca uma igreja abaixo de si mesma (ou de uma das suas).
  begin
    perform public.change_church_position('7d7d7d7d-0000-4000-8000-000000000003', 'subsede', '7d7d7d7d-0000-4000-8000-000000000005');
    raise exception 'FALHA vinculo: moveu uma igreja para baixo de uma das suas filhas';
  exception when sqlstate 'P0001' then null; -- esperado
  end;
  -- Subsede com congregacoes abaixo nao vira congregacao.
  begin
    perform public.change_church_position('7d7d7d7d-0000-4000-8000-000000000002', 'congregacao');
    raise exception 'FALHA vinculo: subsede com filhas virou congregacao';
  exception when sqlstate 'P0001' then null; -- esperado
  end;

  select * into r from public.change_church_position('7d7d7d7d-0000-4000-8000-000000000005', 'congregacao', '7d7d7d7d-0000-4000-8000-000000000001');
  if r.child_company_id is distinct from '6c6c6c6c-0000-4000-8000-000000000005' then
    raise exception 'FALHA vinculo: a igreja movida nao seria avisada (%)', r.child_company_id;
  end if;
end $$;

reset role;

do $$
declare v_pai uuid; n int;
begin
  select parent_id into v_pai from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000005';
  if v_pai is distinct from '7d7d7d7d-0000-4000-8000-000000000001' then
    raise exception 'FALHA vinculo: a igreja nao foi movida para a sede (%)', v_pai;
  end if;
  select count(*) into n from public.church_link_notices
  where company_id = '6c6c6c6c-0000-4000-8000-000000000005' and kind = 'movida';
  if n <> 1 then raise exception 'FALHA vinculo: aviso de mudanca de posicao nao foi criado'; end if;
end $$;

-- A Sub Y (que perdeu a filha) NÃO mexe numa igreja que já não é da árvore dela,
-- e não move ninguém para fora da árvore que administra.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000003","email":"rls-suby@test.local","role":"authenticated"}', true);

do $$
begin
  begin
    perform public.change_church_position('7d7d7d7d-0000-4000-8000-000000000005', 'congregacao', '7d7d7d7d-0000-4000-8000-000000000003');
    raise exception 'FALHA vinculo: subsede mexeu numa igreja que esta direto sob a sede';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

-- A Sede devolve a Cong B para a Sub Y (dentro da árvore dela).
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000001","email":"rls-sede@test.local","role":"authenticated"}', true);

do $$
begin
  perform public.change_church_position('7d7d7d7d-0000-4000-8000-000000000005', 'congregacao', '7d7d7d7d-0000-4000-8000-000000000003');
  begin
    perform public.change_church_position('7d7d7d7d-0000-4000-8000-000000000005', 'congregacao', '7d7d7d7d-0000-4000-8000-000000000003');
    raise exception 'FALHA vinculo: mover para onde ja esta foi aceito';
  exception when sqlstate 'P0001' then null; -- esperado
  end;
end $$;

-- ------------------------- recusa, com devolutiva --------------------------
-- A Sub Y solta a Cong B, gera outro link, e recusa o pedido dela.
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000003","email":"rls-suby@test.local","role":"authenticated"}', true);

do $$
begin
  perform public.end_church_link('7d7d7d7d-0000-4000-8000-000000000005');
  perform public.create_church_link_invite('7d7d7d7d-0000-4000-8000-000000000003', 'congregacao',
    repeat('8', 64), now() + interval '30 days', 5);
end $$;

select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000005","email":"rls-congb@test.local","role":"authenticated"}', true);

do $$
begin
  perform public.request_church_link(repeat('8', 64), '7d7d7d7d-0000-4000-8000-000000000005');
end $$;

select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000003","email":"rls-suby@test.local","role":"authenticated"}', true);

do $$
declare v_req uuid; r record;
begin
  select id into v_req from public.church_link_requests where status = 'pendente';
  select * into r from public.decide_church_link_request(v_req, false, null, 'Ainda vamos conversar.');
  if r.aprovado then raise exception 'FALHA vinculo: a recusa virou aprovacao'; end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000005","email":"rls-congb@test.local","role":"authenticated"}', true);

do $$
declare v_motivo text;
begin
  -- Quem pediu le a devolutiva.
  select motivo_recusa into v_motivo from public.church_link_requests where status = 'recusado';
  if v_motivo is distinct from 'Ainda vamos conversar.' then
    raise exception 'FALHA vinculo: quem pediu nao leu o motivo da recusa (%)', coalesce(v_motivo, '<null>');
  end if;
end $$;

reset role;

do $$
declare v_pai uuid; n int; v_notice uuid;
begin
  select parent_id into v_pai from public.churches where id = '7d7d7d7d-0000-4000-8000-000000000005';
  if v_pai is not null then raise exception 'FALHA vinculo: recusar religou a igreja'; end if;
  select count(*) into n from public.church_link_notices
  where company_id = '6c6c6c6c-0000-4000-8000-000000000005' and kind = 'recusado' and detalhe like 'Ainda%';
  if n <> 1 then raise exception 'FALHA vinculo: aviso de recusa com motivo nao foi criado'; end if;
end $$;

-- "Entendi": só o dono do aviso o dispensa.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-000000000005","email":"rls-congb@test.local","role":"authenticated"}', true);

do $$
declare v_id uuid;
begin
  select id into v_id from public.church_link_notices where seen_at is null limit 1;
  if v_id is null then raise exception 'FALHA vinculo: dono nao ve o proprio aviso'; end if;

  perform set_config('request.jwt.claims',
    '{"sub":"5e5e5e5e-0000-4000-8000-000000000001","email":"rls-sede@test.local","role":"authenticated"}', true);
  begin
    perform public.dismiss_church_link_notice(v_id);
    raise exception 'FALHA vinculo: outro tenant dispensou aviso alheio';
  exception when sqlstate '42501' then null; -- esperado
  end;

  perform set_config('request.jwt.claims',
    '{"sub":"5e5e5e5e-0000-4000-8000-000000000005","email":"rls-congb@test.local","role":"authenticated"}', true);
  if not public.dismiss_church_link_notice(v_id) then raise exception 'FALHA vinculo: dono nao dispensou o aviso'; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Cargos da igreja (migration 20260927130000): quem é o pastor, o secretário...
--
--     S (sede, owner "lsede")
--     └── B (subsede, owner "lsub" + member "lmemb")
--     O (subsede solta de OUTRO tenant, owner "lout")
--
-- Provas: só owner/admin da própria igreja escreve; a sede LÊ os cargos da
-- subsede mas não os altera; member e outro tenant não leem nem escrevem;
-- anon não lê; o client não consegue apontar user_id para a conta de ninguém;
-- um Pastor por igreja; e o aceite do convite liga o registro — só o da
-- empresa que convidou — à conta de quem aceitou.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('9c9c9c9c-0000-4000-8000-000000000001', 'rls-lsede@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Lider Sede"}'),
  ('9c9c9c9c-0000-4000-8000-000000000002', 'rls-lsub@test.local',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Lider Sub"}'),
  ('9c9c9c9c-0000-4000-8000-000000000003', 'rls-lmemb@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Lider Member"}'),
  ('9c9c9c9c-0000-4000-8000-000000000004', 'rls-lout@test.local',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Lider Outro"}'),
  ('9c9c9c9c-0000-4000-8000-000000000005', 'rls-convlider@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Convidado"}');

insert into public.companies (id, name, slug, created_by) values
  ('9d9d9d9d-0000-4000-8000-000000000001', 'Lid Sede', 'rls-lid-sede', '9c9c9c9c-0000-4000-8000-000000000001'),
  ('9d9d9d9d-0000-4000-8000-000000000002', 'Lid Sub',  'rls-lid-sub',  '9c9c9c9c-0000-4000-8000-000000000002'),
  ('9d9d9d9d-0000-4000-8000-000000000003', 'Lid Out',  'rls-lid-out',  '9c9c9c9c-0000-4000-8000-000000000004');

insert into public.company_members (company_id, user_id, role) values
  ('9d9d9d9d-0000-4000-8000-000000000001', '9c9c9c9c-0000-4000-8000-000000000001', 'owner'),
  ('9d9d9d9d-0000-4000-8000-000000000002', '9c9c9c9c-0000-4000-8000-000000000002', 'owner'),
  ('9d9d9d9d-0000-4000-8000-000000000002', '9c9c9c9c-0000-4000-8000-000000000003', 'member'),
  ('9d9d9d9d-0000-4000-8000-000000000003', '9c9c9c9c-0000-4000-8000-000000000004', 'owner');

insert into public.churches (id, company_id, name, slug, public_code, tipo, parent_id) values
  ('9e9e9e9e-0000-4000-8000-000000000001', '9d9d9d9d-0000-4000-8000-000000000001', 'Lid Sede', 'rls-lid-sede', 'rls-lid-sede', 'sede',    null),
  ('9e9e9e9e-0000-4000-8000-000000000002', '9d9d9d9d-0000-4000-8000-000000000002', 'Lid Sub',  'rls-lid-sub',  'rls-lid-sub',  'subsede', '9e9e9e9e-0000-4000-8000-000000000001'),
  ('9e9e9e9e-0000-4000-8000-000000000003', '9d9d9d9d-0000-4000-8000-000000000003', 'Lid Out',  'rls-lid-out',  'rls-lid-out',  'subsede', null);

-- Um líder do OUTRO tenant, com o mesmo e-mail que será convidado na subsede:
-- o aceite não pode ligá-lo à conta de quem aceitou.
insert into public.church_leaders (id, church_id, cargo_id, nome, email) values
  ('9f9f9f9f-0000-4000-8000-000000000009', '9e9e9e9e-0000-4000-8000-000000000003', (select id from public.cargos where slug = 'secretario'), 'Secretario Outro', 'rls-convlider@test.local');

-- ------------------------- owner da subsede B ------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"9c9c9c9c-0000-4000-8000-000000000002","email":"rls-lsub@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- Registra o Pastor da própria igreja.
  -- Sem `id`: o client não tem GRANT nele. O id fixo é posto logo abaixo,
  -- como superuser, para os blocos seguintes acharem o registro.
  insert into public.church_leaders (church_id, cargo_id, nome, email)
  values ('9e9e9e9e-0000-4000-8000-000000000002', (select id from public.cargos where slug = 'pastor'), 'Pastor Sub', 'pastor@test.local');

  select count(*) into n from public.church_leaders where church_id = '9e9e9e9e-0000-4000-8000-000000000002';
  if n <> 1 then raise exception 'FALHA cargos: owner nao ve o proprio pastor (%)', n; end if;

  -- Um Pastor ativo por igreja.
  begin
    insert into public.church_leaders (church_id, cargo_id, nome)
    values ('9e9e9e9e-0000-4000-8000-000000000002', (select id from public.cargos where slug = 'pastor'), 'Segundo Pastor');
    raise exception 'FALHA cargos: a igreja aceitou dois pastores ativos';
  exception when unique_violation then null; -- esperado
  end;

  -- Outros cargos aceitam varias pessoas.
  insert into public.church_leaders (church_id, cargo_id, nome)
  values ('9e9e9e9e-0000-4000-8000-000000000002', (select id from public.cargos where slug = 'diacono'), 'Diacono Um'),
         ('9e9e9e9e-0000-4000-8000-000000000002', (select id from public.cargos where slug = 'diacono'), 'Diacono Dois');

  -- Cargo fora do catalogo e recusado (FK).
  begin
    insert into public.church_leaders (church_id, cargo_id, nome)
    values ('9e9e9e9e-0000-4000-8000-000000000002', 'acacacac-0000-4000-8000-00000000ffff', 'Nome');
    raise exception 'FALHA cargos: cargo fora do catalogo foi aceito';
  exception when foreign_key_violation or check_violation then null; -- esperado
  end;

  -- Nao escreve na igreja de outro tenant, nem na sede acima.
  begin
    insert into public.church_leaders (church_id, cargo_id, nome)
    values ('9e9e9e9e-0000-4000-8000-000000000003', (select id from public.cargos where slug = 'diacono'), 'Invasor');
    raise exception 'FALHA cargos: owner escreveu na igreja de outro tenant';
  exception when sqlstate '42501' then null; -- esperado
  end;
  begin
    insert into public.church_leaders (church_id, cargo_id, nome)
    values ('9e9e9e9e-0000-4000-8000-000000000001', (select id from public.cargos where slug = 'diacono'), 'Invasor');
    raise exception 'FALHA cargos: subsede escreveu na sede acima';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- O client nao aponta o registro para a conta de ninguem (sem GRANT em user_id).
  begin
    update public.church_leaders set user_id = '9c9c9c9c-0000-4000-8000-000000000001'
    where id = '9f9f9f9f-0000-4000-8000-000000000001';
    raise exception 'FALHA cargos: client alterou user_id';
  exception when sqlstate '42501' then null; -- esperado
  end;
  begin
    insert into public.church_leaders (church_id, cargo_id, nome, user_id)
    values ('9e9e9e9e-0000-4000-8000-000000000002', (select id from public.cargos where slug = 'presbitero'), 'Fantasma', '9c9c9c9c-0000-4000-8000-000000000001');
    raise exception 'FALHA cargos: client inseriu com user_id';
  exception when sqlstate '42501' then null; -- esperado
  end;

  -- Os padrões da plataforma são legíveis, mas ninguém escreve neles.
  select count(*) into n from public.cargos where church_id is null and deleted_at is null;
  if n < 5 then raise exception 'FALHA cargos: catalogo da plataforma com % cargos', n; end if;
  begin
    insert into public.cargos (church_id, nome) values (null, 'Bispo');
    raise exception 'FALHA cargos: client criou cargo da plataforma';
  exception when sqlstate '42501' then null; -- esperado
  end;
  update public.cargos set nome = 'Bispo' where slug = 'pastor';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA cargos: client editou cargo da plataforma'; end if;
end $$;

reset role;
update public.church_leaders set id = '9f9f9f9f-0000-4000-8000-000000000001'
where church_id = '9e9e9e9e-0000-4000-8000-000000000002' and cargo_id = (select id from public.cargos where slug = 'pastor') and deleted_at is null;
set local role authenticated;

-- ---------------------- owner da SEDE (igreja acima) ------------------------
select set_config('request.jwt.claims',
  '{"sub":"9c9c9c9c-0000-4000-8000-000000000001","email":"rls-lsede@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- A sede LE o Pastor da subsede (e so o que esta abaixo dela).
  select count(*) into n from public.church_leaders where church_id = '9e9e9e9e-0000-4000-8000-000000000002';
  if n <> 3 then raise exception 'FALHA cargos: sede ve % cargos da subsede (esperado 3)', n; end if;
  select count(*) into n from public.church_leaders where church_id = '9e9e9e9e-0000-4000-8000-000000000003';
  if n <> 0 then raise exception 'FALHA cargos: sede ve cargos de igreja fora da arvore dela'; end if;

  -- ... mas nao escreve na subsede.
  begin
    insert into public.church_leaders (church_id, cargo_id, nome)
    values ('9e9e9e9e-0000-4000-8000-000000000002', (select id from public.cargos where slug = 'presbitero'), 'Imposto pela sede');
    raise exception 'FALHA cargos: sede inseriu cargo na subsede';
  exception when sqlstate '42501' then null; -- esperado
  end;

  update public.church_leaders set nome = 'Sequestrado' where id = '9f9f9f9f-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA cargos: sede alterou cargo da subsede'; end if;
end $$;

-- ------------------------- member da subsede B ------------------------------
select set_config('request.jwt.claims',
  '{"sub":"9c9c9c9c-0000-4000-8000-000000000003","email":"rls-lmemb@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- Nome, e-mail e telefone de lider sao so de owner/admin.
  select count(*) into n from public.church_leaders where church_id = '9e9e9e9e-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA cargos: member ve % cargos', n; end if;

  begin
    insert into public.church_leaders (church_id, cargo_id, nome)
    values ('9e9e9e9e-0000-4000-8000-000000000002', (select id from public.cargos where slug = 'secretario'), 'Por member');
    raise exception 'FALHA cargos: member registrou cargo';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;

-- ------------------------- owner de OUTRO tenant ----------------------------
select set_config('request.jwt.claims',
  '{"sub":"9c9c9c9c-0000-4000-8000-000000000004","email":"rls-lout@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.church_leaders where church_id = '9e9e9e9e-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA cargos: outro tenant ve cargos da subsede'; end if;

  update public.church_leaders set nome = 'Sequestrado' where id = '9f9f9f9f-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA cargos: outro tenant alterou cargo alheio'; end if;
end $$;

reset role;

-- --------------------------------- anon -------------------------------------
set local role anon;
do $$
begin
  begin
    perform 1 from public.church_leaders;
    raise exception 'FALHA cargos: anon leu church_leaders';
  exception when sqlstate '42501' then null; -- esperado
  end;
end $$;
reset role;

-- --------- tirar do cargo: soft delete, e o Pastor pode ser trocado ---------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"9c9c9c9c-0000-4000-8000-000000000002","email":"rls-lsub@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  update public.church_leaders set deleted_at = now(), ate = current_date
  where id = '9f9f9f9f-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA cargos: owner nao conseguiu tirar o pastor do cargo'; end if;

  -- O registro fica no historico e o cargo volta a ficar livre.
  select count(*) into n from public.church_leaders where id = '9f9f9f9f-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'FALHA cargos: historico do pastor sumiu'; end if;

  insert into public.church_leaders (church_id, cargo_id, nome)
  values ('9e9e9e9e-0000-4000-8000-000000000002', (select id from public.cargos where slug = 'pastor'), 'Novo Pastor');
end $$;

reset role;

-- ----- aceite do convite liga o registro a conta (so o da empresa certa) ----
insert into public.church_leaders (id, church_id, cargo_id, nome, email)
values ('9f9f9f9f-0000-4000-8000-000000000002', '9e9e9e9e-0000-4000-8000-000000000002', (select id from public.cargos where slug = 'presbitero'),
        'Presbitero Convidado', 'rls-convlider@test.local');

insert into public.company_invites (company_id, email, role, invited_by)
values ('9d9d9d9d-0000-4000-8000-000000000002', 'rls-convlider@test.local', 'member', '9c9c9c9c-0000-4000-8000-000000000002');

select set_config('test.lider_invite_token', token::text, true)
from public.company_invites
where company_id = '9d9d9d9d-0000-4000-8000-000000000002' and email = 'rls-convlider@test.local';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"9c9c9c9c-0000-4000-8000-000000000005","email":"rls-convlider@test.local","role":"authenticated"}', true);

do $$
begin
  perform public.accept_company_invite(current_setting('test.lider_invite_token')::uuid);
end $$;

reset role;

do $$
declare v_user uuid; v_outro uuid;
begin
  select user_id into v_user from public.church_leaders where id = '9f9f9f9f-0000-4000-8000-000000000002';
  if v_user is distinct from '9c9c9c9c-0000-4000-8000-000000000005' then
    raise exception 'FALHA cargos: aceitar o convite nao ligou o registro a conta (%)', coalesce(v_user::text, '<null>');
  end if;

  select user_id into v_outro from public.church_leaders where id = '9f9f9f9f-0000-4000-8000-000000000009';
  if v_outro is not null then
    raise exception 'FALHA cargos: aceite ligou registro de OUTRA empresa com o mesmo e-mail';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Chamada e Acompanhamento: só a própria igreja lê nomes, presença e motivos;
-- a igreja de cima recebe só números; outra rede não vê nada. E a regra da
-- sequência: ausente soma, justificado é neutro, presente zera.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('acacacac-0000-4000-8000-000000000001', 'rls-ac-sede@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'),
  ('acacacac-0000-4000-8000-000000000002', 'rls-ac-cong@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'),
  ('acacacac-0000-4000-8000-000000000003', 'rls-ac-memb@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'),
  ('acacacac-0000-4000-8000-000000000004', 'rls-ac-secr@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'),
  ('acacacac-0000-4000-8000-000000000005', 'rls-ac-outra@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}');

insert into public.companies (id, name, slug, created_by) values
  ('acacacac-0000-4000-8000-0000000000c1', 'AC Sede',  'rls-ac-sede',  'acacacac-0000-4000-8000-000000000001'),
  ('acacacac-0000-4000-8000-0000000000c2', 'AC Cong',  'rls-ac-cong',  'acacacac-0000-4000-8000-000000000002'),
  ('acacacac-0000-4000-8000-0000000000c3', 'AC Outra', 'rls-ac-outra', 'acacacac-0000-4000-8000-000000000005');

insert into public.company_members (company_id, user_id, role, pode_acompanhar) values
  ('acacacac-0000-4000-8000-0000000000c1', 'acacacac-0000-4000-8000-000000000001', 'owner',  false),
  ('acacacac-0000-4000-8000-0000000000c2', 'acacacac-0000-4000-8000-000000000002', 'owner',  false),
  ('acacacac-0000-4000-8000-0000000000c2', 'acacacac-0000-4000-8000-000000000003', 'member', false),
  ('acacacac-0000-4000-8000-0000000000c2', 'acacacac-0000-4000-8000-000000000004', 'member', true),
  ('acacacac-0000-4000-8000-0000000000c3', 'acacacac-0000-4000-8000-000000000005', 'owner',  false);

insert into public.churches (id, company_id, name, slug, public_code, tipo, parent_id) values
  ('acacacac-0000-4000-8000-0000000000d1', 'acacacac-0000-4000-8000-0000000000c1', 'AC Sede',  'rls-ac-sede',  'rls-ac-sede',  'sede',        null),
  ('acacacac-0000-4000-8000-0000000000d2', 'acacacac-0000-4000-8000-0000000000c2', 'AC Cong',  'rls-ac-cong',  'rls-ac-cong',  'congregacao', 'acacacac-0000-4000-8000-0000000000d1'),
  ('acacacac-0000-4000-8000-0000000000d3', 'acacacac-0000-4000-8000-0000000000c3', 'AC Outra', 'rls-ac-outra', 'rls-ac-outra', 'subsede',     null);

-- Membro de OUTRA igreja, para provar que não dá para cruzar referências.
insert into public.rol_membros (id, church_id, nome)
values ('acacacac-0000-4000-8000-0000000000e9', 'acacacac-0000-4000-8000-0000000000d3', 'Membro Alheio');

-- Cultos da programação (só admin escreve nela; aqui como superuser). O
-- semanal cai no dia da semana de hoje, para as datas do teste baterem.
insert into public.church_schedule (id, church_id, titulo, tipo, dia_semana, hora, registra_chamada) values
  ('acacacac-0000-4000-8000-0000000000f1', 'acacacac-0000-4000-8000-0000000000d2', 'Culto de Domingo', 'semanal',
   extract(dow from current_date)::int, '19:00', true),
  ('acacacac-0000-4000-8000-0000000000f2', 'acacacac-0000-4000-8000-0000000000d2', 'Ensaio do coral', 'semanal',
   extract(dow from current_date)::int, '15:00', false);
insert into public.church_schedule (id, church_id, titulo, tipo, data, hora, deleted_at) values
  ('acacacac-0000-4000-8000-0000000000f3', 'acacacac-0000-4000-8000-0000000000d2', 'Culto removido', 'especial',
   current_date + 1, '19:00', now());

-- ------------------- member AUTORIZADO (secretário) faz tudo ----------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000004","email":"rls-ac-secr@test.local","role":"authenticated"}', true);

do $$
declare
  v_igreja uuid := 'acacacac-0000-4000-8000-0000000000d2';
  v_culto uuid := 'acacacac-0000-4000-8000-0000000000f1';
  m1 uuid; m2 uuid; m3 uuid; m4 uuid;
  n int;
  v_situacao text;
  d1 date := current_date - 28;
  d2 date := current_date - 21;
  d3 date := current_date - 14;
  d4 date := current_date - 7;
begin
  insert into public.rol_membros (church_id, nome) values (v_igreja, 'M1 Some') returning id into m1;
  insert into public.rol_membros (church_id, nome) values (v_igreja, 'M2 Viajando') returning id into m2;
  insert into public.rol_membros (church_id, nome) values (v_igreja, 'M3 Voltou') returning id into m3;
  insert into public.rol_membros (church_id, nome) values (v_igreja, 'M4 Sempre justificado') returning id into m4;

  -- M2 viaja nas duas últimas semanas; M4 está justificado o mês todo.
  insert into public.justificativas (church_id, membro_id, motivo, data_inicio, data_fim)
  values (v_igreja, m2, 'viagem', d3, d4), (v_igreja, m4, 'saude', d1, d4);

  insert into public.acompanhamento_config (church_id, justificativa_longa_cultos)
  values (v_igreja, 3);

  -- M2 e M4 marcados ausentes de propósito: a justificativa por período cobre.
  perform public.salvar_chamada(v_culto, d1, jsonb_build_array(
    jsonb_build_object('membro_id', m1, 'estado', 'ausente'),
    jsonb_build_object('membro_id', m2, 'estado', 'presente'),
    jsonb_build_object('membro_id', m3, 'estado', 'presente'),
    jsonb_build_object('membro_id', m4, 'estado', 'ausente')), '[]');
  perform public.salvar_chamada(v_culto, d2, jsonb_build_array(
    jsonb_build_object('membro_id', m1, 'estado', 'ausente'),
    jsonb_build_object('membro_id', m2, 'estado', 'ausente'),
    jsonb_build_object('membro_id', m3, 'estado', 'ausente'),
    jsonb_build_object('membro_id', m4, 'estado', 'ausente')), '[]');
  perform public.salvar_chamada(v_culto, d3, jsonb_build_array(
    jsonb_build_object('membro_id', m1, 'estado', 'justificado', 'motivo', 'trabalho'),
    jsonb_build_object('membro_id', m2, 'estado', 'ausente'),
    jsonb_build_object('membro_id', m3, 'estado', 'ausente'),
    jsonb_build_object('membro_id', m4, 'estado', 'justificado')),
    jsonb_build_array(jsonb_build_object('nome', 'Visitante Teste', 'telefone', '11999990000')));
  -- Duas vezes: reabrir a mesma chamada edita, não duplica.
  perform public.salvar_chamada(v_culto, d4, jsonb_build_array(
    jsonb_build_object('membro_id', m1, 'estado', 'presente')), '[]');
  perform public.salvar_chamada(v_culto, d4, jsonb_build_array(
    jsonb_build_object('membro_id', m1, 'estado', 'ausente'),
    jsonb_build_object('membro_id', m2, 'estado', 'ausente'),
    jsonb_build_object('membro_id', m3, 'estado', 'presente'),
    jsonb_build_object('membro_id', m4, 'estado', 'ausente')), '[]');

  select count(*) into n from public.chamadas where schedule_id = v_culto;
  if n <> 4 then raise exception 'FALHA chamada: reabrir duplicou (% chamadas)', n; end if;

  -- Marcar Justificado na chamada criou a justificativa de um dia, com o motivo.
  select count(*) into n from public.justificativas where membro_id = m1 and motivo = 'trabalho' and data_inicio = d3;
  if n <> 1 then raise exception 'FALHA chamada: justificado na chamada nao criou justificativa'; end if;

  -- falta, falta, justificado, falta = 3 faltas seguidas.
  select faltas_seguidas into n from public.acompanhamento_alertas(v_igreja) where membro_id = m1;
  if n is distinct from 3 then raise exception 'FALHA sequencia: M1 deveria ter 3 faltas, tem %', n; end if;

  -- Justificativa por período: as ausências cobertas não contam.
  select count(*) into n from public.acompanhamento_alertas(v_igreja) where membro_id = m2;
  if n <> 0 then raise exception 'FALHA sequencia: M2 justificado entrou em alerta'; end if;

  -- Presente zera.
  select count(*) into n from public.acompanhamento_alertas(v_igreja) where membro_id = m3;
  if n <> 0 then raise exception 'FALHA sequencia: presenca nao zerou a sequencia de M3'; end if;

  -- Justificado por 4 cultos seguidos (limite 3) = justificativa longa.
  select cultos_justificados into n from public.acompanhamento_justificativas_longas(v_igreja) where membro_id = m4;
  if n is distinct from 4 then raise exception 'FALHA longas: M4 deveria ter 4 cultos justificados, tem %', n; end if;
  select count(*) into n from public.acompanhamento_alertas(v_igreja) where membro_id = m4;
  if n <> 0 then raise exception 'FALHA longas: M4 justificado entrou em faltas'; end if;

  -- Contato "em acompanhamento" mantém na lista com outra situação...
  insert into public.acompanhamento_contatos (church_id, membro_id, motivo, data, resultado)
  values (v_igreja, m1, 'faltas', current_date - 1, 'em_acompanhamento');
  select situacao into v_situacao from public.acompanhamento_alertas(v_igreja) where membro_id = m1;
  if v_situacao is distinct from 'em_acompanhamento' then
    raise exception 'FALHA contato: M1 deveria estar em acompanhamento, esta %', v_situacao;
  end if;

  -- ...e "retornou" tira da lista.
  insert into public.acompanhamento_contatos (church_id, membro_id, motivo, data, resultado)
  values (v_igreja, m1, 'faltas', current_date, 'retornou');
  select count(*) into n from public.acompanhamento_alertas(v_igreja) where membro_id = m1;
  if n <> 0 then raise exception 'FALHA contato: M1 continua em alerta depois do contato'; end if;

  -- Relatório separa presentes, justificados e ausentes (d3: 0 P, 3 J, 1 A).
  select presentes * 100 + justificados * 10 + ausentes into n
  from public.acompanhamento_relatorio_chamadas(v_igreja, d3, d3);
  if n <> 31 then raise exception 'FALHA relatorio: contagem de d3 errada (%)', n; end if;

  -- Chamada nova só no dia da semana do culto...
  begin
    perform public.salvar_chamada(v_culto, current_date - 1, '[]', '[]');
    raise exception 'FALHA chamada: aceitou data em outro dia da semana';
  exception when sqlstate '23514' then null;
  end;
  -- ...e só para culto marcado para chamada.
  begin
    perform public.salvar_chamada('acacacac-0000-4000-8000-0000000000f2', current_date, '[]', '[]');
    raise exception 'FALHA chamada: aceitou culto com registra_chamada desligado';
  exception when sqlstate '23514' then null;
  end;

  -- Quem faz a chamada lê o nome de culto removido da programação (histórico).
  select count(*) into n from public.church_schedule where id = 'acacacac-0000-4000-8000-0000000000f3';
  if n <> 1 then raise exception 'FALHA programacao: secretario nao le culto removido'; end if;

  -- O member autorizado não edita a programação (isso é do admin).
  update public.church_schedule set registra_chamada = false where id = v_culto;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA programacao: member alterou a programacao'; end if;

  -- Não dá para justificar membro de outra igreja.
  begin
    insert into public.justificativas (church_id, membro_id, motivo, data_inicio, data_fim)
    values (v_igreja, 'acacacac-0000-4000-8000-0000000000e9', 'outro', current_date, current_date);
    raise exception 'FALHA cruzamento: justificativa apontou membro de outra igreja';
  exception when sqlstate '23514' then null;
  end;

  -- "Feita por" é do sistema.
  begin
    update public.chamadas set feita_por = null where schedule_id = v_culto;
    raise exception 'FALHA grants: client alterou feita_por';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- ------------------------ member SEM autorização ----------------------------
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000003","email":"rls-ac-memb@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.rol_membros;
  if n <> 0 then raise exception 'FALHA acompanhamento: member sem autorizacao ve % membros', n; end if;
  select count(*) into n from public.justificativas;
  if n <> 0 then raise exception 'FALHA acompanhamento: member sem autorizacao ve justificativas'; end if;
  select count(*) into n from public.acompanhamento_alertas('acacacac-0000-4000-8000-0000000000d2');
  if n <> 0 then raise exception 'FALHA acompanhamento: member sem autorizacao ve alertas'; end if;

  begin
    insert into public.rol_membros (church_id, nome) values ('acacacac-0000-4000-8000-0000000000d2', 'Intruso');
    raise exception 'FALHA acompanhamento: member sem autorizacao cadastrou membro';
  exception when sqlstate '42501' then null;
  end;

  select count(*) into n from public.church_schedule where id = 'acacacac-0000-4000-8000-0000000000f3';
  if n <> 0 then raise exception 'FALHA programacao: member sem autorizacao le culto removido'; end if;

  -- Não pode se autorizar sozinho.
  update public.company_members set pode_acompanhar = true
  where user_id = 'acacacac-0000-4000-8000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA acompanhamento: member se autorizou'; end if;
end $$;

reset role;
select set_config('test.ac_culto', 'acacacac-0000-4000-8000-0000000000f1', true);
set local role authenticated;

do $$
begin
  perform public.salvar_chamada(current_setting('test.ac_culto')::uuid, current_date, '[]', '[]');
  raise exception 'FALHA acompanhamento: member sem autorizacao salvou chamada';
exception when sqlstate 'P0002' then null;
end $$;

-- -------------------------- owner da congregação ----------------------------
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000002","email":"rls-ac-cong@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- Os 4 do rol + os 3 logins da igreja (todo login vira membro, fora da chamada).
  select count(*) into n from public.rol_membros where user_id is null;
  if n <> 4 then raise exception 'FALHA acompanhamento: owner deveria ver 4 membros do rol, ve %', n; end if;
  select count(*) into n from public.rol_membros where user_id is not null and not participa_chamada;
  if n <> 3 then raise exception 'FALHA membros: os 3 logins deveriam ser membros fora da chamada, sao %', n; end if;

  -- Ninguém liga um membro à conta de outra pessoa (user_id é do sistema).
  begin
    update public.rol_membros set user_id = 'acacacac-0000-4000-8000-000000000001'
    where nome = 'M3 Voltou';
    raise exception 'FALHA membros: client alterou user_id do membro';
  exception when sqlstate '42501' then null;
  end;
  select count(*) into n from public.justificativas where motivo = 'saude';
  if n <> 1 then raise exception 'FALHA acompanhamento: owner nao ve o motivo da propria igreja'; end if;
end $$;

-- ------------------- owner da SEDE: só números, nada de nomes ----------------
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000001","email":"rls-ac-sede@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.rol_membros where church_id = 'acacacac-0000-4000-8000-0000000000d2';
  if n <> 0 then raise exception 'FALHA LGPD: sede le % nomes da congregacao', n; end if;
  select count(*) into n from public.justificativas;
  if n <> 0 then raise exception 'FALHA LGPD: sede le justificativas (motivos) da congregacao'; end if;
  select count(*) into n from public.acompanhamento_presencas_efetivas;
  if n <> 0 then raise exception 'FALHA LGPD: sede le presencas individuais'; end if;
  select count(*) into n from public.acompanhamento_alertas('acacacac-0000-4000-8000-0000000000d2');
  if n <> 0 then raise exception 'FALHA LGPD: sede le a lista de alertas da congregacao'; end if;
  select ativos + em_alerta into n from public.membros_kpis('acacacac-0000-4000-8000-0000000000d2');
  if n <> 0 then raise exception 'FALHA LGPD: sede le os indicadores de membros da congregacao'; end if;

  select membros_ativos into n from public.acompanhamento_resumo_rede('acacacac-0000-4000-8000-0000000000d1')
  where church_id = 'acacacac-0000-4000-8000-0000000000d2';
  if n is distinct from 7 then raise exception 'FALHA rede: sede deveria ver 7 membros ativos (4 do rol + 3 logins) na congregacao, viu %', n; end if;

  update public.rol_membros set nome = 'Editado pela sede' where church_id = 'acacacac-0000-4000-8000-0000000000d2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA acompanhamento: sede editou membro da congregacao'; end if;
end $$;

-- ----------------------------- OUTRA rede -----------------------------------
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000005","email":"rls-ac-outra@test.local","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.rol_membros where church_id <> 'acacacac-0000-4000-8000-0000000000d3';
  if n <> 0 then raise exception 'FALHA acompanhamento: outra rede ve membros alheios'; end if;
  select count(*) into n from public.acompanhamento_resumo_rede('acacacac-0000-4000-8000-0000000000d1');
  if n <> 0 then raise exception 'FALHA acompanhamento: outra rede ve resumo da rede alheia'; end if;
  select count(*) into n from public.chamada_visitantes;
  if n <> 0 then raise exception 'FALHA acompanhamento: outra rede ve visitantes alheios'; end if;

  begin
    insert into public.rol_membros (church_id, nome) values ('acacacac-0000-4000-8000-0000000000d2', 'Invasor');
    raise exception 'FALHA acompanhamento: outra rede cadastrou membro alheio';
  exception when sqlstate '42501' then null;
  end;
end $$;

reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.rol_membros;
    raise exception 'FALHA acompanhamento: anon leu rol_membros';
  exception when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Catálogo de cargos com herança (migration 20261001130000). Reaproveita a
-- árvore dos cargos acima: S (sede) > B (subsede); O é outra rede.
--   * B vê os cargos de S e os padrões; S NÃO vê os de B; O não vê os de S;
--   * só o dono edita (S não edita o de B, B não edita o de S);
--   * B usa o cargo herdado de S num líder; O não consegue usar o de S;
--   * rol: vários cargos por membro, o Pastor é único por igreja.
-- ---------------------------------------------------------------------------
insert into public.cargos (id, church_id, nome) values
  ('cacacaca-0000-4000-8000-000000000001', '9e9e9e9e-0000-4000-8000-000000000001', 'Coordenador de celulas'),
  ('cacacaca-0000-4000-8000-000000000002', '9e9e9e9e-0000-4000-8000-000000000002', 'Zelador');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"9c9c9c9c-0000-4000-8000-000000000002","email":"rls-lsub@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.cargos where id in ('cacacaca-0000-4000-8000-000000000001', 'cacacaca-0000-4000-8000-000000000002');
  if n <> 2 then raise exception 'FALHA heranca: subsede deveria ver o proprio cargo e o da sede (viu %)', n; end if;

  -- A lista pronta (RPC) traz padrão + da sede + o próprio.
  select count(*) into n from public.cargos_visiveis('9e9e9e9e-0000-4000-8000-000000000002')
  where id in ('cacacaca-0000-4000-8000-000000000001', 'cacacaca-0000-4000-8000-000000000002') or slug = 'pastor';
  if n <> 3 then raise exception 'FALHA heranca: cargos_visiveis da subsede veio com % (esperado 3)', n; end if;

  update public.cargos set nome = 'Editado pela sub' where id = 'cacacaca-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA heranca: subsede editou cargo da sede'; end if;

  update public.cargos set nome = 'Zelador(a)' where id = 'cacacaca-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA heranca: subsede nao editou o proprio cargo'; end if;

  -- Usa o cargo herdado num líder da própria igreja.
  insert into public.church_leaders (church_id, cargo_id, nome)
  values ('9e9e9e9e-0000-4000-8000-000000000002', 'cacacaca-0000-4000-8000-000000000001', 'Coordenadora');

  begin
    insert into public.cargos (church_id, nome) values ('9e9e9e9e-0000-4000-8000-000000000001', 'Imposto na sede');
    raise exception 'FALHA heranca: subsede criou cargo na sede';
  exception when sqlstate '42501' then null;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"9c9c9c9c-0000-4000-8000-000000000001","email":"rls-lsede@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.cargos where id = 'cacacaca-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'FALHA heranca: sede ve cargo criado pela subsede'; end if;
  update public.cargos set nome = 'Sede mudou' where id = 'cacacaca-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA heranca: sede editou cargo da subsede'; end if;
  -- Desativar o próprio cargo: soft delete.
  update public.cargos set deleted_at = now() where id = 'cacacaca-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA heranca: sede nao desativou o proprio cargo'; end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"9c9c9c9c-0000-4000-8000-000000000004","email":"rls-lout@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.cargos where church_id is not null and church_id <> '9e9e9e9e-0000-4000-8000-000000000003';
  if n <> 0 then raise exception 'FALHA heranca: outra rede ve % cargos alheios', n; end if;
  select count(*) into n from public.cargos_visiveis('9e9e9e9e-0000-4000-8000-000000000002');
  if n <> 0 then raise exception 'FALHA heranca: outra rede listou os cargos da subsede pela RPC'; end if;
  begin
    insert into public.church_leaders (church_id, cargo_id, nome)
    values ('9e9e9e9e-0000-4000-8000-000000000003', 'cacacaca-0000-4000-8000-000000000002', 'Pegou emprestado');
    raise exception 'FALHA heranca: outra rede usou cargo alheio';
  exception when sqlstate '23514' then null;
  end;
end $$;
reset role;

-- Cargo desativado não pode ser dado de novo, mas quem já tinha continua.
do $$
declare n int;
begin
  select count(*) into n from public.church_leaders
  where cargo_id = 'cacacaca-0000-4000-8000-000000000001' and deleted_at is null;
  if n <> 1 then raise exception 'FALHA heranca: desativar o cargo apagou quem ja tinha'; end if;
  begin
    insert into public.church_leaders (church_id, cargo_id, nome)
    values ('9e9e9e9e-0000-4000-8000-000000000002', 'cacacaca-0000-4000-8000-000000000001', 'Depois de desativado');
    raise exception 'FALHA heranca: cargo desativado foi atribuido';
  exception when sqlstate '23514' then null;
  end;
end $$;

-- Rol: a congregação da chamada (acompanhamento) dá cargos aos membros.
insert into public.rol_membros (id, church_id, nome) values
  ('cacacaca-0000-4000-8000-0000000000a1', 'acacacac-0000-4000-8000-0000000000d2', 'Membro com cargos'),
  ('cacacaca-0000-4000-8000-0000000000a2', 'acacacac-0000-4000-8000-0000000000d2', 'Outro membro');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000004","email":"rls-ac-secr@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  insert into public.rol_membro_cargos (membro_id, cargo_id, church_id) values
    ('cacacaca-0000-4000-8000-0000000000a1', (select id from public.cargos where slug = 'diacono'), 'acacacac-0000-4000-8000-0000000000d2'),
    ('cacacaca-0000-4000-8000-0000000000a1', (select id from public.cargos where slug = 'tesoureiro'), 'acacacac-0000-4000-8000-0000000000d2'),
    ('cacacaca-0000-4000-8000-0000000000a1', (select id from public.cargos where slug = 'pastor'), 'acacacac-0000-4000-8000-0000000000d2');
  select count(*) into n from public.rol_membro_cargos where membro_id = 'cacacaca-0000-4000-8000-0000000000a1';
  if n <> 3 then raise exception 'FALHA rol cargos: esperado 3 cargos no membro, veio %', n; end if;

  begin
    insert into public.rol_membro_cargos (membro_id, cargo_id, church_id) values
      ('cacacaca-0000-4000-8000-0000000000a2', (select id from public.cargos where slug = 'pastor'), 'acacacac-0000-4000-8000-0000000000d2');
    raise exception 'FALHA rol cargos: dois pastores na mesma igreja';
  exception when unique_violation then null;
  end;

  begin
    insert into public.rol_membro_cargos (membro_id, cargo_id, church_id) values
      ('acacacac-0000-4000-8000-0000000000e9', (select id from public.cargos where slug = 'diacono'), 'acacacac-0000-4000-8000-0000000000d2');
    raise exception 'FALHA rol cargos: cargo dado a membro de outra igreja';
  exception when sqlstate '23514' then null;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000001","email":"rls-ac-sede@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.rol_membro_cargos;
  if n <> 0 then raise exception 'FALHA LGPD: sede le cargos dos membros da congregacao'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Membros e acesso (migration 20261001150000)
-- ---------------------------------------------------------------------------
-- O Pastor da congregação (cargo no rol) aparece para a sede pela RPC,
-- só o nome; outra rede não vê.
insert into public.rol_membros (id, church_id, nome) values
  ('cacacaca-0000-4000-8000-0000000000b1', 'acacacac-0000-4000-8000-0000000000d2', 'Pastor da Congregacao');
-- O membro de cargos do bloco anterior já é Pastor nesta igreja: tira para testar com este.
delete from public.rol_membro_cargos
where membro_id = 'cacacaca-0000-4000-8000-0000000000a1' and cargo_id = (select id from public.cargos where slug = 'pastor');
insert into public.rol_membro_cargos (membro_id, cargo_id, church_id) values
  ('cacacaca-0000-4000-8000-0000000000b1', (select id from public.cargos where slug = 'pastor'),
   'acacacac-0000-4000-8000-0000000000d2')
on conflict do nothing;

-- Convidado pela tela de Membros: ao virar login, liga ao membro existente.
insert into public.rol_membros (id, church_id, nome, email) values
  ('cacacaca-0000-4000-8000-0000000000b2', 'acacacac-0000-4000-8000-0000000000d2', 'Futuro Login', 'rls-ac-futuro@test.local');
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('acacacac-0000-4000-8000-000000000009', 'rls-ac-futuro@test.local', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '{"full_name":"Futuro"}');
insert into public.company_members (company_id, user_id, role) values
  ('acacacac-0000-4000-8000-0000000000c2', 'acacacac-0000-4000-8000-000000000009', 'member');

do $$
declare n int; v uuid;
begin
  select user_id into v from public.rol_membros where id = 'cacacaca-0000-4000-8000-0000000000b2';
  if v is distinct from 'acacacac-0000-4000-8000-000000000009' then
    raise exception 'FALHA membros: login novo nao ligou ao membro com o mesmo e-mail';
  end if;
  select count(*) into n from public.rol_membros where user_id = 'acacacac-0000-4000-8000-000000000009';
  if n <> 1 then raise exception 'FALHA membros: login novo criou membro duplicado (%)', n; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000001","email":"rls-ac-sede@test.local","role":"authenticated"}', true);
do $$
declare v text;
begin
  select nome into v from public.pastores_das_igrejas(array['acacacac-0000-4000-8000-0000000000d2'::uuid]);
  if v is distinct from 'Pastor da Congregacao' then
    raise exception 'FALHA membros: sede nao ve o nome do pastor da congregacao (%)', coalesce(v, '<null>');
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000005","email":"rls-ac-outra@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.pastores_das_igrejas(array['acacacac-0000-4000-8000-0000000000d2'::uuid]);
  if n <> 0 then raise exception 'FALHA membros: outra rede ve o pastor da congregacao'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- EBD (migration 20261001160000). Na congregação AC Cong (d2):
--   * professor (0a, member) ensina só a classe K1 (Juniores);
--   * secretaria da EBD (0b, member com pode_gerir_ebd) vê as duas classes;
--   * member sem nada (03), a sede (01) e outra rede (05) não veem nada.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
  ('acacacac-0000-4000-8000-00000000000a', 'rls-ebd-prof@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Prof EBD"}'),
  ('acacacac-0000-4000-8000-00000000000b', 'rls-ebd-secr@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Secr EBD"}');
insert into public.company_members (company_id, user_id, role, pode_gerir_ebd) values
  ('acacacac-0000-4000-8000-0000000000c2', 'acacacac-0000-4000-8000-00000000000a', 'member', false),
  ('acacacac-0000-4000-8000-0000000000c2', 'acacacac-0000-4000-8000-00000000000b', 'member', true);

insert into public.ebd_classes (id, church_id, nome) values
  ('ebdebdeb-0000-4000-8000-0000000000a1', 'acacacac-0000-4000-8000-0000000000d2', 'Juniores'),
  ('ebdebdeb-0000-4000-8000-0000000000a2', 'acacacac-0000-4000-8000-0000000000d2', 'Adultos');

-- O professor é o membro ligado ao login dele (criado pelo trigger).
insert into public.ebd_professores (classe_id, membro_id, church_id)
select 'ebdebdeb-0000-4000-8000-0000000000a1', m.id, 'acacacac-0000-4000-8000-0000000000d2'
from public.rol_membros m where m.user_id = 'acacacac-0000-4000-8000-00000000000a';

insert into public.rol_membros (id, church_id, nome, observacoes) values
  ('ebdebdeb-0000-4000-8000-0000000000b1', 'acacacac-0000-4000-8000-0000000000d2', 'Aluno Junior', 'Nota pastoral sigilosa'),
  ('ebdebdeb-0000-4000-8000-0000000000b2', 'acacacac-0000-4000-8000-0000000000d2', 'Aluno Adulto', null),
  ('ebdebdeb-0000-4000-8000-0000000000b3', 'acacacac-0000-4000-8000-0000000000d2', 'Sem classe', null);
insert into public.ebd_matriculas (classe_id, membro_id, church_id, desde) values
  ('ebdebdeb-0000-4000-8000-0000000000a1', 'ebdebdeb-0000-4000-8000-0000000000b1', 'acacacac-0000-4000-8000-0000000000d2', current_date - 30),
  ('ebdebdeb-0000-4000-8000-0000000000a2', 'ebdebdeb-0000-4000-8000-0000000000b2', 'acacacac-0000-4000-8000-0000000000d2', current_date - 30);

-- ------------------------------ professor ----------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-00000000000a","email":"rls-ebd-prof@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_classes;
  if n <> 1 then raise exception 'FALHA ebd: professor deveria ver 1 classe, ve %', n; end if;
  select count(*) into n from public.ebd_classes_da_igreja('acacacac-0000-4000-8000-0000000000d2');
  if n <> 1 then raise exception 'FALHA ebd: lista de classes do professor veio com %', n; end if;

  select count(*) into n from public.ebd_alunos_da_classe('ebdebdeb-0000-4000-8000-0000000000a1');
  if n <> 1 then raise exception 'FALHA ebd: professor nao ve os alunos da propria classe (%)', n; end if;
  select count(*) into n from public.ebd_alunos_da_classe('ebdebdeb-0000-4000-8000-0000000000a2');
  if n <> 0 then raise exception 'FALHA ebd: professor ve alunos de outra classe'; end if;

  -- Não lê o rol (observações pastorais ficam fora).
  select count(*) into n from public.rol_membros where observacoes is not null;
  if n <> 0 then raise exception 'FALHA ebd: professor le o rol de membros'; end if;

  -- Chamada da própria classe, com visitante.
  perform public.ebd_salvar_aula('ebdebdeb-0000-4000-8000-0000000000a1', current_date, 'Licao 1', 5, 4, 1250,
    jsonb_build_array(jsonb_build_object('membro_id', 'ebdebdeb-0000-4000-8000-0000000000b1', 'estado', 'presente')),
    jsonb_build_array(jsonb_build_object('nome', 'Visitante Mirim')));
  select presentes * 10 + visitantes into n
  from public.ebd_resumo_do_dia('acacacac-0000-4000-8000-0000000000d2', current_date)
  where classe_id = 'ebdebdeb-0000-4000-8000-0000000000a1';
  if n <> 11 then raise exception 'FALHA ebd: resumo do dia errado (%)', n; end if;
  select count(*) into n from public.ebd_resumo_do_dia('acacacac-0000-4000-8000-0000000000d2', current_date);
  if n <> 1 then raise exception 'FALHA ebd: professor ve % classes no resumo do dia', n; end if;

  -- Aluno de outra classe não entra na chamada.
  begin
    perform public.ebd_salvar_aula('ebdebdeb-0000-4000-8000-0000000000a1', current_date, null, 0, 0, 0,
      jsonb_build_array(jsonb_build_object('membro_id', 'ebdebdeb-0000-4000-8000-0000000000b2', 'estado', 'presente')), '[]');
    raise exception 'FALHA ebd: chamada aceitou aluno de outra classe';
  exception when sqlstate '23514' then null;
  end;

  -- Outra classe: não.
  begin
    perform public.ebd_salvar_aula('ebdebdeb-0000-4000-8000-0000000000a2', current_date, null, 0, 0, 0, '[]', '[]');
    raise exception 'FALHA ebd: professor fez chamada de outra classe';
  exception when sqlstate 'P0002' then null;
  end;

  -- Matricula o visitante como aluno novo (não membro, fora da chamada dos cultos).
  perform public.ebd_matricular_novo('ebdebdeb-0000-4000-8000-0000000000a1', 'Visitante Mirim', null, null,
    (select id from public.ebd_visitantes where nome = 'Visitante Mirim'));
  select count(*) into n from public.ebd_alunos_da_classe('ebdebdeb-0000-4000-8000-0000000000a1') where not membro_igreja;
  if n <> 1 then raise exception 'FALHA ebd: visitante matriculado nao virou aluno nao-membro'; end if;

  -- Matricular quem já está no rol e criar classe é da gestão.
  begin
    perform public.ebd_matricular('ebdebdeb-0000-4000-8000-0000000000a1', 'ebdebdeb-0000-4000-8000-0000000000b3');
    raise exception 'FALHA ebd: professor matriculou pessoa do rol';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    insert into public.ebd_classes (church_id, nome) values ('acacacac-0000-4000-8000-0000000000d2', 'Invadida');
    raise exception 'FALHA ebd: professor criou classe';
  exception when sqlstate '42501' then null;
  end;
  -- Presença não se grava direto na tabela.
  begin
    insert into public.ebd_presencas (aula_id, membro_id, classe_id, church_id, estado)
    select id, 'ebdebdeb-0000-4000-8000-0000000000b1', classe_id, church_id, 'ausente' from public.ebd_aulas limit 1;
    raise exception 'FALHA ebd: client gravou presenca direto';
  exception when sqlstate '42501' then null;
  end;
  -- A ficha EBD de um membro é de quem cuida do rol ou da EBD, não do professor.
  select count(*) into n from public.ebd_resumo_do_membro('ebdebdeb-0000-4000-8000-0000000000b1');
  if n <> 0 then raise exception 'FALHA ebd: professor le o resumo EBD da ficha do membro'; end if;
end $$;

-- ---------------------------- secretaria EBD -------------------------------
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-00000000000b","email":"rls-ebd-secr@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_classes;
  if n <> 2 then raise exception 'FALHA ebd: secretaria deveria ver 2 classes, ve %', n; end if;
  select count(*) into n from public.ebd_buscar_pessoas('acacacac-0000-4000-8000-0000000000d2', 'sem classe');
  if n <> 1 then raise exception 'FALHA ebd: secretaria nao encontra pessoa para matricular'; end if;
  perform public.ebd_matricular('ebdebdeb-0000-4000-8000-0000000000a2', 'ebdebdeb-0000-4000-8000-0000000000b3');
  -- Mudar de classe encerra a anterior.
  perform public.ebd_matricular('ebdebdeb-0000-4000-8000-0000000000a1', 'ebdebdeb-0000-4000-8000-0000000000b3');
  select count(*) into n from public.ebd_matriculas where membro_id = 'ebdebdeb-0000-4000-8000-0000000000b3' and ate is null;
  if n <> 1 then raise exception 'FALHA ebd: pessoa ficou com % matriculas ativas', n; end if;
  insert into public.ebd_classes (church_id, nome) values ('acacacac-0000-4000-8000-0000000000d2', 'Jovens');
  select count(*) into n from public.ebd_resumo_do_membro('ebdebdeb-0000-4000-8000-0000000000b1');
  if n <> 1 then raise exception 'FALHA ebd: secretaria nao ve o resumo EBD do membro'; end if;
end $$;

-- ------------------------- member sem autorização --------------------------
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000003","email":"rls-ac-memb@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_classes;
  if n <> 0 then raise exception 'FALHA ebd: member sem autorizacao ve classes'; end if;
  select count(*) into n from public.ebd_alunos_da_classe('ebdebdeb-0000-4000-8000-0000000000a1');
  if n <> 0 then raise exception 'FALHA ebd: member sem autorizacao ve alunos'; end if;
end $$;

-- --------------------------- sede e outra rede -----------------------------
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000001","email":"rls-ac-sede@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_classes where church_id = 'acacacac-0000-4000-8000-0000000000d2';
  if n <> 0 then raise exception 'FALHA LGPD: sede ve classes da EBD da congregacao'; end if;
  select count(*) into n from public.ebd_resumo_do_dia('acacacac-0000-4000-8000-0000000000d2', current_date);
  if n <> 0 then raise exception 'FALHA LGPD: sede ve o resumo da EBD da congregacao'; end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000005","email":"rls-ac-outra@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_presencas;
  if n <> 0 then raise exception 'FALHA ebd: outra rede ve presencas'; end if;
  begin
    perform public.ebd_salvar_aula('ebdebdeb-0000-4000-8000-0000000000a1', current_date, null, 0, 0, 0, '[]', '[]');
    raise exception 'FALHA ebd: outra rede fez chamada';
  exception when sqlstate 'P0002' then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- EBD etapa 2 (migration 20261001170000): alertas, contatos, relatórios e
-- trimestres. Aluno Adulto (b2, classe K2) falta 3 domingos seguidos.
-- ---------------------------------------------------------------------------
do $$
declare v_aula uuid; s int;
begin
  for s in 1 .. 3 loop
    insert into public.ebd_aulas (classe_id, church_id, data, oferta_centavos)
    values ('ebdebdeb-0000-4000-8000-0000000000a2', 'acacacac-0000-4000-8000-0000000000d2', current_date - 7 * s, 1000)
    returning id into v_aula;
    insert into public.ebd_presencas (aula_id, membro_id, classe_id, church_id, estado)
    values (v_aula, 'ebdebdeb-0000-4000-8000-0000000000b2', 'ebdebdeb-0000-4000-8000-0000000000a2',
            'acacacac-0000-4000-8000-0000000000d2', 'ausente');
  end loop;
end $$;

-- ------------------------------ professor (K1) -----------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-00000000000a","email":"rls-ebd-prof@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_alertas('acacacac-0000-4000-8000-0000000000d2');
  if n <> 0 then raise exception 'FALHA ebd2: professor ve alerta de outra classe'; end if;
  select count(*) into n from public.ebd_relatorio_classes('acacacac-0000-4000-8000-0000000000d2', current_date - 60, current_date);
  if n <> 1 then raise exception 'FALHA ebd2: relatorio do professor com % classes', n; end if;
  select count(*) into n from public.ebd_frequencia_alunos('acacacac-0000-4000-8000-0000000000d2', null, current_date - 60, current_date)
  where classe_id = 'ebdebdeb-0000-4000-8000-0000000000a2';
  if n <> 0 then raise exception 'FALHA ebd2: professor ve frequencia de outra classe'; end if;

  begin
    insert into public.ebd_contatos (church_id, membro_id, classe_id, resultado)
    values ('acacacac-0000-4000-8000-0000000000d2', 'ebdebdeb-0000-4000-8000-0000000000b2',
            'ebdebdeb-0000-4000-8000-0000000000a2', 'retornou');
    raise exception 'FALHA ebd2: professor registrou contato em outra classe';
  exception when sqlstate '42501' then null;
  end;
  begin
    insert into public.ebd_config (church_id, faltas_alerta) values ('acacacac-0000-4000-8000-0000000000d2', 1);
    raise exception 'FALHA ebd2: professor mudou as regras do alerta';
  exception when sqlstate '42501' then null;
  end;
  begin
    insert into public.ebd_trimestres (church_id, nome, inicio, fim)
    values ('acacacac-0000-4000-8000-0000000000d2', 'Invadido', current_date, current_date + 90);
    raise exception 'FALHA ebd2: professor criou trimestre';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- ---------------------------- secretaria da EBD ----------------------------
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-00000000000b","email":"rls-ebd-secr@test.local","role":"authenticated"}', true);
do $$
declare n int; v text;
begin
  select faltas_seguidas into n from public.ebd_alertas('acacacac-0000-4000-8000-0000000000d2')
  where membro_id = 'ebdebdeb-0000-4000-8000-0000000000b2';
  if n is distinct from 3 then raise exception 'FALHA ebd2: aluno com 3 faltas nao entrou em alerta (%)', n; end if;

  select percentual into v from public.ebd_frequencia_alunos(
    'acacacac-0000-4000-8000-0000000000d2', 'ebdebdeb-0000-4000-8000-0000000000a2', current_date - 60, current_date)
  where membro_id = 'ebdebdeb-0000-4000-8000-0000000000b2';
  if v is distinct from '0.0' then raise exception 'FALHA ebd2: frequencia do aluno faltoso veio %', v; end if;

  select oferta_centavos::int into n from public.ebd_relatorio_classes('acacacac-0000-4000-8000-0000000000d2', current_date - 60, current_date)
  where classe_id = 'ebdebdeb-0000-4000-8000-0000000000a2';
  if n <> 3000 then raise exception 'FALHA ebd2: oferta somada errada (%)', n; end if;

  insert into public.ebd_contatos (church_id, membro_id, classe_id, data, resultado)
  values ('acacacac-0000-4000-8000-0000000000d2', 'ebdebdeb-0000-4000-8000-0000000000b2',
          'ebdebdeb-0000-4000-8000-0000000000a2', current_date - 1, 'em_acompanhamento');
  select situacao into v from public.ebd_alertas('acacacac-0000-4000-8000-0000000000d2')
  where membro_id = 'ebdebdeb-0000-4000-8000-0000000000b2';
  if v is distinct from 'em_acompanhamento' then raise exception 'FALHA ebd2: contato nao mudou a situacao (%)', v; end if;

  insert into public.ebd_contatos (church_id, membro_id, classe_id, data, resultado)
  values ('acacacac-0000-4000-8000-0000000000d2', 'ebdebdeb-0000-4000-8000-0000000000b2',
          'ebdebdeb-0000-4000-8000-0000000000a2', current_date, 'retornou');
  select count(*) into n from public.ebd_alertas('acacacac-0000-4000-8000-0000000000d2')
  where membro_id = 'ebdebdeb-0000-4000-8000-0000000000b2';
  if n <> 0 then raise exception 'FALHA ebd2: contato retornou nao tirou do alerta'; end if;

  insert into public.ebd_trimestres (church_id, nome, inicio, fim, revista)
  values ('acacacac-0000-4000-8000-0000000000d2', '4o trimestre', current_date - 30, current_date + 60, 'Revista X');
  insert into public.ebd_config (church_id, faltas_alerta) values ('acacacac-0000-4000-8000-0000000000d2', 4);
end $$;

-- O professor lê os trimestres (para escolher o período), mas não as regras.
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-00000000000a","email":"rls-ebd-prof@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_trimestres;
  if n <> 1 then raise exception 'FALHA ebd2: professor nao ve os trimestres'; end if;
  select count(*) into n from public.ebd_config;
  if n <> 0 then raise exception 'FALHA ebd2: professor le as regras da gestao'; end if;
end $$;

-- --------------------- member sem nada e outra rede ------------------------
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000003","email":"rls-ac-memb@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_trimestres;
  if n <> 0 then raise exception 'FALHA ebd2: member sem autorizacao ve trimestres'; end if;
  select count(*) into n from public.ebd_contatos;
  if n <> 0 then raise exception 'FALHA ebd2: member sem autorizacao ve contatos'; end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000005","email":"rls-ac-outra@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_alertas('acacacac-0000-4000-8000-0000000000d2');
  if n <> 0 then raise exception 'FALHA ebd2: outra rede ve alertas da EBD'; end if;
  select count(*) into n from public.ebd_relatorio_classes('acacacac-0000-4000-8000-0000000000d2', current_date - 60, current_date);
  if n <> 0 then raise exception 'FALHA ebd2: outra rede ve relatorio da EBD'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- EBD etapa 3 (migration 20261001180000): responsáveis, cuidados, promoção,
-- lições. b1 = aluno da classe K1 (professor 0a); b2 = aluno da K2.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-00000000000a","email":"rls-ebd-prof@test.local","role":"authenticated"}', true);
do $$
declare n int; v text;
begin
  perform public.ebd_salvar_responsavel(null, 'ebdebdeb-0000-4000-8000-0000000000b1', null,
    'Mae do Aluno', '11955554444', 'Mãe', true);
  perform public.ebd_salvar_cuidados('ebdebdeb-0000-4000-8000-0000000000b1', 'Alergia a amendoim');

  select count(*) into n from public.ebd_responsaveis(array[
    'ebdebdeb-0000-4000-8000-0000000000b1', 'ebdebdeb-0000-4000-8000-0000000000b2']::uuid[]);
  if n <> 1 then raise exception 'FALHA ebd3: professor ve % responsaveis (esperado 1, so da classe dele)', n; end if;

  select cuidados into v from public.ebd_alunos_da_classe('ebdebdeb-0000-4000-8000-0000000000a1')
  where membro_id = 'ebdebdeb-0000-4000-8000-0000000000b1';
  if v is distinct from 'Alergia a amendoim' then raise exception 'FALHA ebd3: cuidados nao aparecem para o professor'; end if;

  begin
    perform public.ebd_salvar_responsavel(null, 'ebdebdeb-0000-4000-8000-0000000000b2', null, 'Intruso', null, 'Pai', true);
    raise exception 'FALHA ebd3: professor cadastrou responsavel de aluno de outra classe';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform public.ebd_salvar_cuidados('ebdebdeb-0000-4000-8000-0000000000b2', 'x');
    raise exception 'FALHA ebd3: professor mudou cuidados de aluno de outra classe';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    insert into public.rol_responsaveis (church_id, membro_id, nome, parentesco)
    values ('acacacac-0000-4000-8000-0000000000d2', 'ebdebdeb-0000-4000-8000-0000000000b1', 'Direto', 'Pai');
    raise exception 'FALHA ebd3: client gravou responsavel direto na tabela';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.ebd_promover('acacacac-0000-4000-8000-0000000000d2', current_date,
      jsonb_build_array(jsonb_build_object('membro_id', 'ebdebdeb-0000-4000-8000-0000000000b1',
                                           'classe_id', 'ebdebdeb-0000-4000-8000-0000000000a2')));
    raise exception 'FALHA ebd3: professor promoveu aluno';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    insert into public.ebd_licoes (trimestre_id, church_id, numero, data)
    select id, church_id, 1, inicio from public.ebd_trimestres limit 1;
    raise exception 'FALHA ebd3: professor criou licao';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- ---------------------------- secretaria da EBD ----------------------------
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-00000000000b","email":"rls-ebd-secr@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  insert into public.ebd_licoes (trimestre_id, church_id, numero, data, titulo)
  select id, church_id, 1, inicio, 'A criacao' from public.ebd_trimestres limit 1;

  -- Promove b1 da K1 para a K2: fecha a antiga, abre a nova.
  select public.ebd_promover('acacacac-0000-4000-8000-0000000000d2', current_date + 1,
    jsonb_build_array(jsonb_build_object('membro_id', 'ebdebdeb-0000-4000-8000-0000000000b1',
                                         'classe_id', 'ebdebdeb-0000-4000-8000-0000000000a2'))) into n;
  if n <> 1 then raise exception 'FALHA ebd3: promocao nao moveu o aluno (%)', n; end if;
  select count(*) into n from public.ebd_matriculas
  where membro_id = 'ebdebdeb-0000-4000-8000-0000000000b1' and ate is null and classe_id = 'ebdebdeb-0000-4000-8000-0000000000a2';
  if n <> 1 then raise exception 'FALHA ebd3: aluno promovido sem matricula nova'; end if;
  select count(*) into n from public.ebd_matriculas
  where membro_id = 'ebdebdeb-0000-4000-8000-0000000000b1' and classe_id = 'ebdebdeb-0000-4000-8000-0000000000a1' and ate = current_date;
  if n <> 1 then raise exception 'FALHA ebd3: matricula antiga nao foi encerrada na vespera'; end if;
end $$;

-- O professor lê as lições (para a chamada).
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-00000000000a","email":"rls-ebd-prof@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_licoes;
  if n <> 1 then raise exception 'FALHA ebd3: professor nao le as licoes'; end if;
end $$;

-- ---------------------------- sede e outra rede ----------------------------
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000001","email":"rls-ac-sede@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.rol_responsaveis;
  if n <> 0 then raise exception 'FALHA LGPD: sede ve responsaveis das criancas da congregacao'; end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000005","email":"rls-ac-outra@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_responsaveis(array['ebdebdeb-0000-4000-8000-0000000000b1']::uuid[]);
  if n <> 0 then raise exception 'FALHA ebd3: outra rede ve responsaveis'; end if;
  begin
    perform public.ebd_salvar_cuidados('ebdebdeb-0000-4000-8000-0000000000b1', 'x');
    raise exception 'FALHA ebd3: outra rede mudou cuidados';
  exception when sqlstate 'P0002' then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- EBD rede e títulos por classe (migration 20261001190000).
-- Sede AC Sede (d1) acima da congregação AC Cong (d2), que tem EBD.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000001","email":"rls-ac-sede@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select matriculados into n from public.ebd_resumo_rede('acacacac-0000-4000-8000-0000000000d1')
  where church_id = 'acacacac-0000-4000-8000-0000000000d2';
  if coalesce(n, 0) < 1 then raise exception 'FALHA ebd rede: sede nao ve os numeros da EBD da congregacao (%)', n; end if;
end $$;

-- Professor da congregação não é da igreja de cima: não vê a rede da sede.
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-00000000000a","email":"rls-ebd-prof@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_resumo_rede('acacacac-0000-4000-8000-0000000000d1');
  if n <> 0 then raise exception 'FALHA ebd rede: professor da congregacao ve a rede da sede'; end if;
  begin
    insert into public.ebd_licao_titulos (licao_id, classe_id, church_id, titulo)
    select id, 'ebdebdeb-0000-4000-8000-0000000000a1', church_id, 'Titulo do professor' from public.ebd_licoes limit 1;
    raise exception 'FALHA ebd titulos: professor gravou titulo';
  exception when sqlstate '42501' then null;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000005","email":"rls-ac-outra@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_resumo_rede('acacacac-0000-4000-8000-0000000000d1');
  if n <> 0 then raise exception 'FALHA ebd rede: outra rede ve a EBD da rede alheia'; end if;
end $$;

-- Secretaria grava o título da classe; o professor da classe lê.
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-00000000000b","email":"rls-ebd-secr@test.local","role":"authenticated"}', true);
do $$
begin
  insert into public.ebd_licao_titulos (licao_id, classe_id, church_id, titulo)
  select id, 'ebdebdeb-0000-4000-8000-0000000000a1', church_id, 'Titulo da revista Juniores' from public.ebd_licoes limit 1;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-00000000000a","email":"rls-ebd-prof@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.ebd_licao_titulos;
  if n <> 1 then raise exception 'FALHA ebd titulos: professor nao le o titulo da propria classe'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- meus_cargos (migration 20261001200000): a pessoa vê só os próprios cargos.
-- O member autorizado (04) da AC Cong ganha o cargo Diácono no rol.
-- ---------------------------------------------------------------------------
insert into public.rol_membro_cargos (membro_id, cargo_id, church_id)
select m.id, (select id from public.cargos where slug = 'diacono'), m.church_id
from public.rol_membros m where m.user_id = 'acacacac-0000-4000-8000-000000000004';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000004","email":"rls-ac-secr@test.local","role":"authenticated"}', true);
do $$
declare v text;
begin
  select string_agg(nome, ',') into v from public.meus_cargos('acacacac-0000-4000-8000-0000000000c2');
  if v is distinct from 'Diácono' then raise exception 'FALHA meus_cargos: esperado Diácono, veio %', v; end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000005","email":"rls-ac-outra@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.meus_cargos('acacacac-0000-4000-8000-0000000000c2');
  if n <> 0 then raise exception 'FALHA meus_cargos: outra rede viu cargos da congregacao'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Acessos por cargo (migration 20261004100000): o módulo liberado para um
-- cargo abre de verdade, com herança. AC Sede (c1) -> AC Cong (c2); AC Outra
-- (c3) é outra rede. O member 03 da AC Cong ganha o cargo Secretário.
-- ---------------------------------------------------------------------------
do $$
declare v_membro uuid;
begin
  select id into v_membro from public.rol_membros
  where user_id = 'acacacac-0000-4000-8000-000000000003'
    and church_id = 'acacacac-0000-4000-8000-0000000000d2' and deleted_at is null;
  if v_membro is null then raise exception 'FIXTURE acessos: member 03 sem linha no rol'; end if;
  insert into public.rol_membro_cargos (membro_id, cargo_id, church_id)
  values (v_membro, (select id from public.cargos where slug = 'secretario'), 'acacacac-0000-4000-8000-0000000000d2');
end $$;

set local role authenticated;

-- Antes de qualquer liberação: cargo sozinho não abre nada.
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000003","email":"rls-ac-memb@test.local","role":"authenticated"}', true);
do $$
begin
  if public.tem_acesso('acacacac-0000-4000-8000-0000000000c2', 'campaigns') then
    raise exception 'FALHA acessos: cargo sem liberacao ja abre campanhas';
  end if;
  if public.can_gerir_ebd('acacacac-0000-4000-8000-0000000000d2') then
    raise exception 'FALHA acessos: cargo sem liberacao ja gere a EBD';
  end if;
  if public.can_acompanhar('acacacac-0000-4000-8000-0000000000d2') then
    raise exception 'FALHA acessos: cargo sem liberacao ja acompanha';
  end if;
end $$;

-- A sede libera Campanhas e EBD para o Secretário.
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000001","email":"rls-ac-sede@test.local","role":"authenticated"}', true);
do $$
declare v_cargo uuid := (select id from public.cargos where slug = 'secretario');
begin
  perform public.salvar_cargo_acessos('acacacac-0000-4000-8000-0000000000c1', jsonb_build_array(
    jsonb_build_object('cargo_id', v_cargo, 'modulo', 'campaigns', 'permitido', true),
    jsonb_build_object('cargo_id', v_cargo, 'modulo', 'ebd', 'permitido', true)));

  -- A sede não grava na igreja de baixo (não é responsável por ela).
  begin
    perform public.salvar_cargo_acessos('acacacac-0000-4000-8000-0000000000c2', '[]'::jsonb);
    raise exception 'FALHA acessos: sede gravou os acessos da congregacao';
  exception when sqlstate '42501' then null;
  end;

  -- Módulo fora da lista (ex.: pedidos de oração) não é gravável.
  begin
    perform public.salvar_cargo_acessos('acacacac-0000-4000-8000-0000000000c1', jsonb_build_array(
      jsonb_build_object('cargo_id', v_cargo, 'modulo', 'prayers', 'permitido', true)));
    raise exception 'FALHA acessos: gravou modulo nao liberavel';
  exception when check_violation then null;
  end;

  -- Sem GRANT: ninguém lê nem escreve a tabela direto.
  begin
    perform 1 from public.cargo_acessos;
    raise exception 'FALHA acessos: authenticated leu cargo_acessos direto';
  exception when sqlstate '42501' then null;
  end;
end $$;

-- O Secretário da congregação herda da sede: abre Campanhas e EBD, e só.
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000003","email":"rls-ac-memb@test.local","role":"authenticated"}', true);
do $$
declare v text; n int;
begin
  if not public.tem_acesso('acacacac-0000-4000-8000-0000000000c2', 'campaigns') then
    raise exception 'FALHA acessos: secretario nao herdou campanhas da sede';
  end if;
  if not public.can_gerir_ebd('acacacac-0000-4000-8000-0000000000d2') then
    raise exception 'FALHA acessos: secretario nao herdou a EBD da sede';
  end if;
  if public.tem_acesso('acacacac-0000-4000-8000-0000000000c2', 'events') then
    raise exception 'FALHA acessos: secretario abriu modulo nao liberado';
  end if;
  if public.can_acompanhar('acacacac-0000-4000-8000-0000000000d2') then
    raise exception 'FALHA acessos: secretario le o rol sem Membros/Presenca liberado';
  end if;
  -- Não vira administrador, nem ganha nada na igreja de cima.
  if public.is_company_admin('acacacac-0000-4000-8000-0000000000c2') then
    raise exception 'FALHA acessos: cargo liberado virou administrador';
  end if;
  if public.tem_acesso('acacacac-0000-4000-8000-0000000000c1', 'campaigns') then
    raise exception 'FALHA acessos: secretario da congregacao abriu campanhas da sede';
  end if;

  select string_agg(modulo, ',' order by modulo) into v from public.meus_acessos()
  where company_id = 'acacacac-0000-4000-8000-0000000000c2';
  if v is distinct from 'campaigns,ebd' then raise exception 'FALHA acessos: meus_acessos veio %', v; end if;

  -- Não configura nem enxerga a configuração.
  begin
    perform public.salvar_cargo_acessos('acacacac-0000-4000-8000-0000000000c2', '[]'::jsonb);
    raise exception 'FALHA acessos: member alterou os acessos';
  exception when sqlstate '42501' then null;
  end;
  select count(*) into n from public.cargo_acessos_da_rede('acacacac-0000-4000-8000-0000000000c2');
  if n <> 0 then raise exception 'FALHA acessos: member leu a configuracao de acessos'; end if;
end $$;

-- O responsável da congregação tira Campanhas e libera Membros: a dele vence.
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000002","email":"rls-ac-cong@test.local","role":"authenticated"}', true);
do $$
declare v_cargo uuid := (select id from public.cargos where slug = 'secretario'); n int;
begin
  perform public.salvar_cargo_acessos('acacacac-0000-4000-8000-0000000000c2', jsonb_build_array(
    jsonb_build_object('cargo_id', v_cargo, 'modulo', 'campaigns', 'permitido', false),
    jsonb_build_object('cargo_id', v_cargo, 'modulo', 'membros', 'permitido', true)));
  select count(*) into n from public.cargo_acessos_da_rede('acacacac-0000-4000-8000-0000000000c2');
  if n <> 4 then raise exception 'FALHA acessos: esperado 2 proprias + 2 herdadas, veio %', n; end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000003","email":"rls-ac-memb@test.local","role":"authenticated"}', true);
do $$
begin
  if public.tem_acesso('acacacac-0000-4000-8000-0000000000c2', 'campaigns') then
    raise exception 'FALHA acessos: a congregacao tirou campanhas e o secretario ainda abre';
  end if;
  if not public.can_gerir_ebd('acacacac-0000-4000-8000-0000000000d2') then
    raise exception 'FALHA acessos: secretario perdeu a EBD herdada';
  end if;
  if not public.can_acompanhar('acacacac-0000-4000-8000-0000000000d2') then
    raise exception 'FALHA acessos: Membros liberado nao abriu o rol';
  end if;
end $$;

-- Outra rede não herda nada da AC Sede.
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000005","email":"rls-ac-outra@test.local","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.cargo_acessos_da_rede('acacacac-0000-4000-8000-0000000000c3');
  if n <> 0 then raise exception 'FALHA acessos: outra rede herdou acessos (% linhas)', n; end if;
end $$;
reset role;

-- Sem o cargo, o acesso some na hora.
delete from public.rol_membro_cargos rc using public.rol_membros m
where rc.membro_id = m.id and m.user_id = 'acacacac-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"acacacac-0000-4000-8000-000000000003","email":"rls-ac-memb@test.local","role":"authenticated"}', true);
do $$
begin
  if public.can_gerir_ebd('acacacac-0000-4000-8000-0000000000d2')
     or public.can_acompanhar('acacacac-0000-4000-8000-0000000000d2') then
    raise exception 'FALHA acessos: perdeu o cargo e manteve o acesso';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Cobertura: toda tabela de `public` com church_id ou company_id tem RLS
-- ligada. Tabela nova esquecida quebra o teste aqui, antes de ir para o ar.
-- ---------------------------------------------------------------------------
do $$
declare v_sem_rls text;
begin
  select string_agg(distinct c.relname, ', ') into v_sem_rls
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
  join pg_attribute a on a.attrelid = c.oid and a.attname in ('church_id', 'company_id') and not a.attisdropped
  where c.relkind = 'r'
    and not c.relrowsecurity;
  if v_sem_rls is not null then
    raise exception 'FALHA cobertura: tabelas com dado de igreja SEM RLS: %', v_sem_rls;
  end if;
end $$;

rollback;

\echo 'RLS OK: todos os testes de isolamento multi-tenant passaram.'
