-- Extensão necessária para gen_random_uuid(), usada em todos os defaults de PK deste projeto.
create extension if not exists pgcrypto;

-- Função utilitária reaproveitada por todas as tabelas: mantém updated_at sempre atual.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles: extensão 1:1 de auth.users com dados de perfil (nome, avatar).
-- Não é "tabela de negócio" multi-tenant: não tem company_id porque o profile não
-- pertence a uma empresa, é o usuário em si. O vínculo N:N usuário<->empresa fica em
-- company_members (uma tabela separada, criada na migration seguinte).
-- Não tem deleted_at: o ciclo de vida do profile segue auth.users (on delete cascade).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Tabelas criadas pela role "postgres" (dona das migrations) NÃO herdam automaticamente
-- privilégio de SELECT/INSERT/UPDATE/DELETE para anon/authenticated no Supabase local —
-- só objetos criados pela role supabase_admin herdam isso via default ACL. Sem este
-- GRANT, o Postgres nega o acesso antes mesmo de avaliar as policies de RLS abaixo.
grant select, update on public.profiles to authenticated;

-- Cria automaticamente um profile quando alguém se cadastra no Supabase Auth.
-- security definer é necessário porque o usuário ainda não tem sessão/RLS no momento do signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- SELECT: o usuário sempre pode ver o próprio profile.
-- (A policy que permite ver o profile de colegas de empresa é criada na migration de
-- company_members, pois depende dessa tabela existir.)
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- UPDATE: usuário só pode editar o próprio profile.
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Não há policy de INSERT/DELETE para o client: o insert é feito pelo trigger
-- (security definer) no signup; não existe hard delete de profile pela aplicação.
