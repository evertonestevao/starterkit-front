-- Termos de Uso versionados + consentimentos LGPD por finalidade.
--
-- Estas tabelas são de USUÁRIO, não de tenant (como profiles): o aceite dos
-- termos é da pessoa, vale para todas as empresas dela — por isso não têm
-- company_id (mesma exceção documentada de plans/roles).
--
-- Modelo LGPD: consentimentos são registros SEPARADOS e específicos por
-- finalidade — nunca um checkbox genérico. Dois tipos neste starter:
--   * aceite dos Termos de Uso/Privacidade (obrigatório p/ usar o sistema)
--     -> terms_acceptances, amarrado à VERSÃO aceita
--   * comunicação por email (opcional, revogável)
--     -> user_consents, log de eventos grant/revoke por finalidade

-- ---------------------------------------------------------------------------
-- terms_versions: catálogo global de versões dos termos.
-- Escrita SÓ por migration/service_role (nenhuma policy/GRANT de escrita).
-- ---------------------------------------------------------------------------
create table public.terms_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  content text not null,
  published_at timestamptz not null default now(),
  is_current boolean not null default false
);

-- Só UMA versão vigente por vez.
create unique index terms_versions_one_current
  on public.terms_versions (is_current) where is_current;

alter table public.terms_versions enable row level security;

-- Ver GRANT no comentário de profiles: sem GRANT explícito a RLS nem é
-- avaliada. Leitura para anon também: a página de termos é pública.
grant select on public.terms_versions to anon, authenticated;

-- Qualquer pessoa lê os termos (conteúdo é público por natureza).
create policy "terms_versions_select_all"
  on public.terms_versions for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- terms_acceptances: prova de aceite (quem, qual versão, quando, de onde).
-- APPEND-ONLY para o client: GRANT só de SELECT e INSERT (padrão audit_logs).
-- ---------------------------------------------------------------------------
create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  terms_version_id uuid not null references public.terms_versions (id),
  accepted_at timestamptz not null default now(),
  -- IP e user-agent da request do aceite (evidência LGPD).
  ip_address text,
  user_agent text,
  -- um aceite por usuário por versão
  unique (user_id, terms_version_id)
);

alter table public.terms_acceptances enable row level security;
grant select, insert on public.terms_acceptances to authenticated;

-- Usuário só vê os próprios aceites.
create policy "terms_acceptances_select_own"
  on public.terms_acceptances for select to authenticated
  using (user_id = auth.uid());

-- Usuário só registra aceite EM NOME PRÓPRIO.
create policy "terms_acceptances_insert_own"
  on public.terms_acceptances for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- user_consents: log de eventos de consentimento por finalidade (LGPD).
-- Cada linha é um evento grant/revoke; o estado atual é o evento mais
-- recente da finalidade. APPEND-ONLY (revogar = inserir granted=false).
-- ---------------------------------------------------------------------------
create table public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- finalidades específicas; adicione novas via migration (check constraint)
  consent_type text not null check (consent_type in ('email_communications')),
  granted boolean not null,
  created_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);

create index user_consents_lookup
  on public.user_consents (user_id, consent_type, created_at desc);

alter table public.user_consents enable row level security;
grant select, insert on public.user_consents to authenticated;

create policy "user_consents_select_own"
  on public.user_consents for select to authenticated
  using (user_id = auth.uid());

create policy "user_consents_insert_own"
  on public.user_consents for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Versão 1 de exemplo — valida o fluxo técnico ponta a ponta.
-- ---------------------------------------------------------------------------
insert into public.terms_versions (version, content, is_current) values (
  1,
  E'# Termos de Uso e Política de Privacidade\n\n'
  '**ATENÇÃO: ESTE É UM TEXTO DE EXEMPLO (PLACEHOLDER).**\n\n'
  'Este conteúdo existe apenas para validar o fluxo técnico de aceite de termos '
  'do starter kit. Ele NÃO tem valor jurídico e DEVE ser substituído por texto '
  'redigido e revisado por profissional jurídico antes de qualquer uso com '
  'clientes reais.\n\n'
  '## 1. Sobre o serviço\n'
  'Descreva aqui o que o seu produto faz e as condições de uso.\n\n'
  '## 2. Dados pessoais\n'
  'Descreva aqui quais dados são coletados, com qual finalidade e base legal '
  '(LGPD, Lei 13.709/2018), por quanto tempo são retidos e como o titular '
  'exerce seus direitos.\n\n'
  '## 3. Contato\n'
  'Informe aqui o canal do encarregado de dados (DPO).',
  true
);
