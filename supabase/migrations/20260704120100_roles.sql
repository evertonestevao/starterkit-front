-- roles: catálogo global e fixo de papéis (owner, admin, member), conforme definido em
-- CLAUDE.md. Não é tabela de negócio por tenant (não tem company_id/deleted_at): é uma
-- tabela de referência compartilhada por todas as empresas, mantida só via migration.
-- company_members.role referencia roles.code (FK), garantindo que só papéis válidos existam.
create table public.roles (
  code text primary key,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

insert into public.roles (code, name, description) values
  ('owner', 'Owner', 'Dono da empresa. Controle total, incluindo billing e exclusão da empresa.'),
  ('admin', 'Admin', 'Administra membros, convites e configurações, mas não decide sobre billing.'),
  ('member', 'Member', 'Acesso operacional ao workspace da empresa, sem permissões administrativas.');

alter table public.roles enable row level security;

-- Ver GRANT no comentário de profiles: tabelas de dono "postgres" precisam de GRANT
-- explícito para authenticated, senão o acesso é negado antes da RLS ser avaliada.
grant select on public.roles to authenticated;

-- SELECT: qualquer usuário autenticado pode ler o catálogo de papéis (dado de referência,
-- necessário por exemplo para popular um <select> de papel ao convidar um membro).
create policy "roles_select_authenticated"
  on public.roles
  for select
  to authenticated
  using (true);

-- Sem policies de INSERT/UPDATE/DELETE: o catálogo é fixo e só muda via nova migration.
