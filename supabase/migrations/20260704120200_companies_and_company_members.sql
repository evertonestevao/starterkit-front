-- companies e company_members são criadas na mesma migration porque suas RLS policies
-- dependem uma da outra (para ver uma empresa é preciso checar company_members, e para
-- inserir o primeiro membro é preciso a empresa já existir). Separar em duas migrations
-- exigiria criar a policy de "companies" antes de company_members existir, o que quebra.

-- companies: a própria empresa (tenant). Não tem company_id (ela É o tenant), mas tem
-- deleted_at para soft delete.
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references public.profiles (id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create trigger set_companies_updated_at
  before update on public.companies
  for each row
  execute function public.set_updated_at();

-- company_members: vínculo N:N entre profiles e companies, com papel (role) e soft delete
-- (deleted_at = usuário removido/saiu da empresa, mas o histórico é preservado).
create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null references public.roles (code) default 'member',
  invited_by uuid references public.profiles (id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um usuário só pode ter uma linha ATIVA por empresa (evita duplicidade de papel).
-- É "partial unique" para permitir reconvite após remoção (linha antiga fica com deleted_at).
create unique index company_members_company_user_active_idx
  on public.company_members (company_id, user_id)
  where deleted_at is null;

create index company_members_user_id_idx on public.company_members (user_id);
create index company_members_company_id_idx on public.company_members (company_id) where deleted_at is null;

create trigger set_company_members_updated_at
  before update on public.company_members
  for each row
  execute function public.set_updated_at();

-- Funções auxiliares (security definer) usadas por TODAS as tabelas de negócio deste
-- projeto para checar acesso multi-tenant. São security definer para não recair em
-- recursão de RLS: elas leem company_members "por fora" da RLS do chamador (o dono da
-- função, o superuser da migration, tem bypass de RLS por padrão).
create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
  );
$$;

create or replace function public.is_company_admin(p_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
      and cm.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_company_owner(p_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
      and cm.role = 'owner'
  );
$$;

grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.is_company_admin(uuid) to authenticated;
grant execute on function public.is_company_owner(uuid) to authenticated;

-- Criar empresa é uma operação atômica (empresa + primeiro membro como owner) e por isso
-- fica atrás de uma RPC security definer, em vez de duas policies de INSERT separadas.
-- Isso evita o estado inconsistente de "empresa criada sem nenhum owner".
create or replace function public.create_company(p_name text, p_slug text)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies;
begin
  insert into public.companies (name, slug, created_by)
  values (p_name, p_slug, auth.uid())
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company.id, auth.uid(), 'owner');

  return v_company;
end;
$$;

grant execute on function public.create_company(text, text) to authenticated;

-- Sair da empresa é feito por RPC (não por UPDATE direto do client) para evitar que a
-- policy de UPDATE de company_members precise permitir client alterar a própria role
-- (o que abriria brecha para auto-promoção a owner).
create or replace function public.leave_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.company_members
  set deleted_at = now()
  where company_id = p_company_id
    and user_id = auth.uid()
    and deleted_at is null;
end;
$$;

grant execute on function public.leave_company(uuid) to authenticated;

alter table public.companies enable row level security;
alter table public.company_members enable row level security;

-- Ver GRANT no comentário de profiles: tabelas de dono "postgres" precisam de GRANT
-- explícito para authenticated, senão o acesso é negado antes da RLS ser avaliada.
-- Não concedemos INSERT em companies (criação só via create_company(), RPC security
-- definer, que roda como "postgres" e não precisa desse grant).
grant select, update on public.companies to authenticated;
grant select, insert, update on public.company_members to authenticated;

-- companies

-- SELECT: só quem é membro ativo da empresa pode vê-la.
create policy "companies_select_member"
  on public.companies
  for select
  to authenticated
  using (public.is_company_member(id));

-- UPDATE: só owner/admin podem editar dados da empresa (nome, slug) ou soft-deletar
-- (setar deleted_at). Regras mais finas (ex: só owner pode deletar) ficam a cargo do
-- service layer, que replica essa checagem antes de operações sensíveis.
create policy "companies_update_admin"
  on public.companies
  for update
  to authenticated
  using (public.is_company_admin(id))
  with check (public.is_company_admin(id));

-- Não há policy de INSERT: criação de empresa só acontece via create_company() (RPC
-- security definer), garantindo que toda empresa nasça com um owner.
-- Não há policy de DELETE: não existe hard delete de empresa pela aplicação.

-- company_members

-- SELECT: qualquer membro ativo da empresa pode ver a lista de membros dela.
create policy "company_members_select_member"
  on public.company_members
  for select
  to authenticated
  using (public.is_company_member(company_id));

-- INSERT: só owner/admin podem adicionar membros diretamente. O fluxo normal é convite
-- (company_invites) + aceite via RPC; isso cobre adição direta por um admin.
create policy "company_members_insert_admin"
  on public.company_members
  for insert
  to authenticated
  with check (public.is_company_admin(company_id));

-- UPDATE: só owner/admin podem alterar papel de outros membros ou removê-los (soft
-- delete via deleted_at). Sair da própria empresa é feito por leave_company(), não por
-- UPDATE direto, para não precisar liberar o client a editar a própria linha.
create policy "company_members_update_admin"
  on public.company_members
  for update
  to authenticated
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

-- Não há policy de DELETE: remoção de membro é sempre soft delete via UPDATE.

-- profiles: policy adicional que só pode existir depois de company_members existir.
-- Permite ver o profile (nome/avatar) de qualquer colega que divida uma empresa ativa
-- com o usuário logado — necessário para listar equipe, exibir quem convidou, etc.
create policy "profiles_select_company_peers"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_members me
      join public.company_members peer on peer.company_id = me.company_id
      where me.user_id = auth.uid()
        and me.deleted_at is null
        and peer.user_id = public.profiles.id
        and peer.deleted_at is null
    )
  );
