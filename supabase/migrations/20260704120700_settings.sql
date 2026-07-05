-- settings: pares chave/valor de configuração por empresa (feature flags, preferências,
-- etc). Tabela de negócio por tenant (company_id) com soft delete (deleted_at).
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Só uma configuração ATIVA por chave por empresa; permite recriar uma chave depois de
-- removida (linha antiga soft-deletada permanece para histórico).
create unique index settings_company_key_active_idx
  on public.settings (company_id, key)
  where deleted_at is null;

create trigger set_settings_updated_at
  before update on public.settings
  for each row
  execute function public.set_updated_at();

alter table public.settings enable row level security;

-- Ver GRANT no comentário de profiles: tabelas de dono "postgres" precisam de GRANT
-- explícito para authenticated, senão o acesso é negado antes da RLS ser avaliada.
grant select, insert, update on public.settings to authenticated;

-- SELECT: qualquer membro ativo da empresa pode ler as configurações (ex: tema, feature
-- flags que afetam a UI de todos os papéis).
create policy "settings_select_member"
  on public.settings
  for select
  to authenticated
  using (public.is_company_member(company_id));

-- INSERT/UPDATE: só owner/admin podem criar ou alterar configurações da empresa.
create policy "settings_insert_admin"
  on public.settings
  for insert
  to authenticated
  with check (public.is_company_admin(company_id));

create policy "settings_update_admin"
  on public.settings
  for update
  to authenticated
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

-- Não há policy de DELETE: remoção de uma configuração é soft delete via UPDATE.
