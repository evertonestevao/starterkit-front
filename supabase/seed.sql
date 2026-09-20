-- ---------------------------------------------------------------------------
-- Seed de DESENVOLVIMENTO
-- ---------------------------------------------------------------------------
-- Roda no `supabase db reset` (config.toml -> [db.seed]). NÃO vai para
-- produção: cria usuários com senha conhecida e dados inventados.
--
-- Monta uma árvore parecida com a do piloto — 1 sede, 3 subsedes e 12
-- congregações — porque quase todo bug de hierarquia só aparece com mais de
-- um nível e mais de um irmão.
--
-- Senha de todos os usuários: dev123456 (as contas estão em docs/dev.md).

-- As igrejas de demonstração do core saem na migration 20260923100000, que
-- também tornou `churches.company_id` NOT NULL. Aqui embaixo é só gente nova.

-- ---------------------------------------------------------------------------
-- Ajudantes (removidos no fim do arquivo)
-- ---------------------------------------------------------------------------
create or replace function public.__seed_user(p_email text, p_nome text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  -- As colunas de token nascem NULL nesta tabela, e o GoTrue (em Go) quebra ao
  -- ler NULL onde espera texto: com elas nulas, `listUsers` da API de admin
  -- passa a falhar para o projeto inteiro. Por isso entram como string vazia.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  )
  values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, crypt('dev123456', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_nome), now(), now(),
    '', '', '', ''
  );

  -- Sem a identidade, o login por email/senha do GoTrue não encontra a conta.
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  -- Aceite dos termos vigentes, para o seed não parar todo mundo na tela de
  -- aceite antes de ver qualquer coisa.
  insert into public.terms_acceptances (user_id, terms_version_id)
  select v_id, id from public.terms_versions
  where is_current and audience = (case when p_email like 'patrocinador%' then 'patrocinador' else 'igreja' end);

  return v_id;
end;
$$;

-- Cria empresa + igreja + pastor dono, como o onboarding faria.
create or replace function public.__seed_church(
  p_slug text, p_nome text, p_tipo text, p_parent uuid, p_email text, p_pastor text
)
returns uuid
language plpgsql
as $$
declare
  v_user uuid;
  v_company uuid;
  v_church uuid;
begin
  v_user := public.__seed_user(p_email, p_pastor);

  insert into public.companies (name, slug, created_by)
  values (p_nome, p_slug, v_user)
  returning id into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company, v_user, 'owner');

  insert into public.churches (company_id, name, slug, public_code, tipo, parent_id, address)
  values (v_company, p_nome, p_slug, p_slug, p_tipo, p_parent,
          'Rua das Acácias, 100 - ' || p_nome)
  returning id into v_church;

  return v_church;
end;
$$;

-- ---------------------------------------------------------------------------
-- A árvore
-- ---------------------------------------------------------------------------
do $$
declare
  v_sede uuid;
  v_sub uuid;
  v_cong uuid;
  v_subs text[][] := array[
    ['zona-norte', 'Graça Zona Norte'],
    ['zona-sul', 'Graça Zona Sul'],
    ['litoral', 'Graça Litoral']
  ];
  v_congs text[][] := array[
    ['vila-nova', 'Vila Nova'], ['jardim-aurora', 'Jardim Aurora'],
    ['parque-industrial', 'Parque Industrial'], ['bairro-alto', 'Bairro Alto']
  ];
  i int;
  j int;
begin
  v_sede := public.__seed_church(
    'graca-central', 'Comunidade da Graça', 'sede', null,
    'pastor.sede@dev.local', 'Pastor da Sede');

  for i in 1 .. array_length(v_subs, 1) loop
    v_sub := public.__seed_church(
      v_subs[i][1], v_subs[i][2], 'subsede', v_sede,
      'pastor.' || replace(v_subs[i][1], '-', '') || '@dev.local',
      'Pastor ' || v_subs[i][2]);

    for j in 1 .. array_length(v_congs, 1) loop
      v_cong := public.__seed_church(
        v_subs[i][1] || '-' || v_congs[j][1],
        v_subs[i][2] || ' · ' || v_congs[j][2],
        'congregacao', v_sub,
        'pastor.' || replace(v_subs[i][1], '-', '') || '.' || replace(v_congs[j][1], '-', '') || '@dev.local',
        'Pastor ' || v_congs[j][2]);
    end loop;
  end loop;
end $$;

-- Um auxiliar com papel `member` na primeira subsede: é com ele que se vê o
-- que member NÃO pode (pedido de oração, patrocinadores).
do $$
declare v_user uuid;
begin
  v_user := public.__seed_user('auxiliar.zonanorte@dev.local', 'Auxiliar Zona Norte');
  insert into public.company_members (company_id, user_id, role)
  select c.company_id, v_user, 'member' from public.churches c where c.slug = 'zona-norte';
end $$;

-- Moderação da plataforma.
do $$
declare v_user uuid;
begin
  v_user := public.__seed_user('plataforma@dev.local', 'Moderação da Plataforma');
  insert into public.platform_staff (user_id, email) values (v_user, 'plataforma@dev.local');
end $$;

-- Chave PIX em parte das igrejas (as outras ficam sem, de propósito: a página
-- precisa funcionar sem dízimo configurado).
update public.churches
set pix_chave = slug || '@pix.dev.local', pix_titular = 'Associação ' || name
where tipo in ('sede', 'subsede') or slug like '%vila-nova';

-- ---------------------------------------------------------------------------
-- Patrocinadores: um em dia, um atrasado DENTRO da carência e um FORA dela
-- ---------------------------------------------------------------------------
do $$
declare
  v_user uuid;
  v_conta uuid;
  v_igreja uuid;
  v_expansao uuid;
begin
  -- 1) Em dia. Tem um primeiro patrocínio e uma expansão.
  v_user := public.__seed_user('patrocinador.pago@dev.local', 'Padaria Pão da Vida');
  insert into public.sponsor_accounts (
    user_id, kind, display_name, email, document, gateway, gateway_customer_id,
    gateway_subscription_id, billing_status, billed_amount_cents, next_due_date
  )
  values (v_user, 'business', 'Padaria Pão da Vida', 'patrocinador.pago@dev.local',
          '11222333000181', 'fake', 'cus_dev_1', 'sub_dev_1', 'active', 7480,
          current_date + 20)
  returning id into v_conta;

  select id into v_igreja from public.churches where slug = 'zona-norte-vila-nova';
  select id into v_expansao from public.churches where slug = 'zona-norte';

  insert into public.sponsorships (sponsor_id, church_id, company_id, status, activated_at, primeiro)
  select v_conta, c.id, c.company_id, 'active', now() - interval '80 days', true
  from public.churches c where c.id = v_igreja;
  insert into public.sponsorships (sponsor_id, church_id, company_id, status, activated_at, primeiro)
  select v_conta, c.id, c.company_id, 'active', now() - interval '50 days', false
  from public.churches c where c.id = v_expansao;

  insert into public.sponsor_charges (
    sponsor_id, gateway, gateway_payment_id, amount_cents, active_count, due_date, paid_at, status
  )
  values
    (v_conta, 'fake', 'pay_dev_1', 3990, 1, current_date - 50, now() - interval '50 days', 'paid'),
    (v_conta, 'fake', 'pay_dev_2', 7480, 2, current_date - 20, now() - interval '20 days', 'paid');

  -- 2) Atrasado há 5 dias: com carência de 15, a marca continua na vitrine.
  v_user := public.__seed_user('patrocinador.atraso@dev.local', 'Auto Peças Betel');
  insert into public.sponsor_accounts (
    user_id, kind, display_name, email, document, gateway, gateway_customer_id,
    gateway_subscription_id, billing_status, billed_amount_cents, next_due_date
  )
  values (v_user, 'business', 'Auto Peças Betel', 'patrocinador.atraso@dev.local',
          '22333444000192', 'fake', 'cus_dev_2', 'sub_dev_2', 'overdue', 3990,
          current_date - 5)
  returning id into v_conta;

  insert into public.sponsorships (sponsor_id, church_id, company_id, status, activated_at, primeiro)
  select v_conta, c.id, c.company_id, 'active', now() - interval '120 days', true
  from public.churches c where c.slug = 'zona-sul-jardim-aurora';

  insert into public.sponsor_charges (
    sponsor_id, gateway, gateway_payment_id, amount_cents, active_count, due_date, status
  )
  values (v_conta, 'fake', 'pay_dev_3', 3990, 1, current_date - 5, 'overdue');

  -- 3) Atrasado há 40 dias: passou da carência e a marca sumiu da vitrine.
  v_user := public.__seed_user('patrocinador.sumido@dev.local', 'Mercado Boa Semente');
  insert into public.sponsor_accounts (
    user_id, kind, display_name, email, document, gateway, gateway_customer_id,
    gateway_subscription_id, billing_status, billed_amount_cents, next_due_date
  )
  values (v_user, 'business', 'Mercado Boa Semente', 'patrocinador.sumido@dev.local',
          '33444555000103', 'fake', 'cus_dev_3', 'sub_dev_3', 'overdue', 3990,
          current_date - 40)
  returning id into v_conta;

  insert into public.sponsorships (sponsor_id, church_id, company_id, status, activated_at, primeiro)
  select v_conta, c.id, c.company_id, 'active', now() - interval '200 days', true
  from public.churches c where c.slug = 'litoral-bairro-alto';

  insert into public.sponsor_charges (
    sponsor_id, gateway, gateway_payment_id, amount_cents, active_count, due_date, status
  )
  values (v_conta, 'fake', 'pay_dev_4', 3990, 1, current_date - 40, 'overdue');
end $$;

-- ---------------------------------------------------------------------------
-- Programação, eventos, inscrições e pedidos de oração
-- ---------------------------------------------------------------------------
insert into public.church_schedule (church_id, titulo, tipo, dia_semana, hora, local)
select c.id, t.titulo, 'semanal', t.dia, t.hora, null
from public.churches c
cross join (values ('Culto de celebração', 0, time '18:00'),
                   ('Estudo bíblico', 3, time '19:30')) as t(titulo, dia, hora);

insert into public.church_schedule (church_id, titulo, tipo, data, hora, descricao)
select c.id, 'Santa Ceia', 'especial', current_date + 12, time '19:00', 'Primeiro domingo do mês.'
from public.churches c where c.tipo in ('sede', 'subsede');

insert into public.church_events (church_id, titulo, descricao, inicio, local, preco_cents)
select c.id, 'Encontro de casais',
       'Um fim de semana para casais, com café da manhã e palestras.',
       now() + interval '25 days', 'Salão principal', 12000
from public.churches c where c.tipo in ('sede', 'subsede');

insert into public.church_events (church_id, titulo, descricao, inicio, preco_cents)
select c.id, 'Culto de missões', 'Noite de missões com a igreja toda.',
       now() + interval '10 days', 0
from public.churches c where c.tipo = 'congregacao';

-- Inscrições (a função sign_up_for_event é o caminho real; no seed vai direto).
insert into public.event_signups (church_id, event_id, event_name, person_name, contact)
select e.church_id, e.id, e.titulo,
       (array['Ana Souza', 'Carlos Lima', 'Marta Ribeiro', 'João Pedro', 'Rita Alves'])[1 + (g % 5)],
       '119' || lpad((10000000 + g * 7919 % 89999999)::text, 8, '0')
from public.church_events e
cross join generate_series(1, 4) g;

insert into public.prayer_requests (church_id, name, message)
select c.id,
       (array['Visitante', 'Maria', 'José', null])[1 + (g % 4)],
       (array['Orem pela saúde da minha mãe.',
              'Estou desempregado há três meses.',
              'Pela paz na minha família.'])[1 + (g % 3)]
from public.churches c
cross join generate_series(1, 3) g;

insert into public.visitors (church_id, name, contact)
select c.id, 'Visitante ' || g, '1199999' || lpad(g::text, 4, '0')
from public.churches c
cross join generate_series(1, 2) g
where c.tipo <> 'sede';

-- ---------------------------------------------------------------------------
-- Visitas e "copiei a chave PIX" das últimas 8 semanas
-- ---------------------------------------------------------------------------
-- Volume diferente por igreja (o id dá o "acaso"), para os gráficos não
-- saírem todos iguais.
insert into public.church_page_visits (church_id, origem, created_at)
select
  c.id,
  (array['link', 'qr', 'qr', 'nfc'])[1 + ((g + ('x' || substr(c.id::text, 1, 4))::bit(16)::int) % 4)],
  now() - make_interval(days => (g % 56), hours => (g % 23))
from public.churches c
cross join generate_series(1, 40) g
where (('x' || substr(c.id::text, 1, 4))::bit(16)::int + g) % 3 <> 0;

insert into public.church_pix_copies (church_id, created_at)
select c.id, now() - make_interval(days => (g * 3) % 56)
from public.churches c
cross join generate_series(1, 6) g
where c.pix_chave is not null;

drop function public.__seed_church(text, text, text, uuid, text, text);
drop function public.__seed_user(text, text);
