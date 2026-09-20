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
  set name = 'Igreja Alice Renomeada'
  where id = 'd1d1d1d1-0000-4000-8000-000000000001';

  -- Mas não na igreja do outro tenant.
  update public.churches
  set name = 'invadida'
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

-- Igreja sem dono (linhas de demonstração) nunca segura domínio.
do $$
begin
  begin
    insert into public.churches (company_id, name, slug, public_code, dominio_customizado)
    values (null, 'Sem dono', 'rls-sem-dono', 'rls-sem-dono', 'semdono.com.br');
    raise exception 'FALHA dominio: igreja sem company_id recebeu dominio';
  exception when check_violation then null; -- esperado
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

-- Igreja sem dono (demonstração) para provar que não recebe patrocínio pago.
insert into public.churches (id, company_id, name, slug, public_code)
values ('d9d9d9d9-0000-4000-8000-000000000009', null, 'Igreja Demo RLS', 'rls-igreja-demo', 'rls-demo');

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

  -- Igreja sem dono não recebe patrocínio pago.
  begin
    perform public.request_sponsorship('d9d9d9d9-0000-4000-8000-000000000009');
    raise exception 'FALHA sponsor: igreja sem dono aceitou patrocinio';
  exception when sqlstate 'P0002' then null;
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

-- A trilha é conferida fora da sessão do staff: nem ele lê a tabela direto.
do $$
declare n int;
begin
  select count(*) into n from public.platform_staff_actions
  where action = 'platform.settings.update';
  if n <> 1 then raise exception 'FALHA settings: alteracao sem registro na trilha'; end if;
end $$;

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
  ('5e5e5e5e-0000-4000-8000-00000000000a', 'rls-patro4@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"full_name":"Patrocinador sem limite"}');
insert into public.sponsor_accounts (id, user_id, kind, display_name, email, document, billing_status)
values ('8a8a8a8a-0000-4000-8000-000000000003', '5e5e5e5e-0000-4000-8000-00000000000a',
        'business', 'Sem Limite', 'rls-patro4@test.local', '55666777000125', 'active');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e5e5e5e-0000-4000-8000-00000000000a","email":"rls-patro4@test.local","role":"authenticated"}', true);
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
