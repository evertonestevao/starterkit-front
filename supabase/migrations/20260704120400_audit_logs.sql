-- audit_logs: trilha de auditoria por empresa. Mantém company_id para isolamento
-- multi-tenant. Tem deleted_at só por consistência de schema com as demais tabelas de
-- negócio, mas nenhuma policy de UPDATE/DELETE é criada abaixo — ou seja, na prática a
-- tabela é append-only/imutável para o client, o que é exigido para um log de auditoria
-- confiável (alterações de billing, membros, etc. feitas via service_role no servidor
-- também não usam essa coluna).
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index audit_logs_company_id_idx on public.audit_logs (company_id, created_at desc);

alter table public.audit_logs enable row level security;

-- Ver GRANT no comentário de profiles: tabelas de dono "postgres" precisam de GRANT
-- explícito para authenticated, senão o acesso é negado antes da RLS ser avaliada.
-- Sem UPDATE/DELETE aqui, reforçando que a tabela é append-only para o client.
grant select, insert on public.audit_logs to authenticated;

-- SELECT: só owner/admin podem ler a trilha de auditoria da empresa (pode conter ações
-- sensíveis de outros membros); member comum não vê.
create policy "audit_logs_select_admin"
  on public.audit_logs
  for select
  to authenticated
  using (public.is_company_admin(company_id));

-- INSERT: qualquer membro ativo da empresa pode registrar uma ação, desde que o
-- user_id gravado seja o dele mesmo (ou nulo, para eventos de sistema). Isso permite que
-- a própria aplicação (rodando como o usuário logado) grave eventos; gravações feitas
-- pelo servidor com service_role ignoram RLS e não passam por essa policy.
create policy "audit_logs_insert_member"
  on public.audit_logs
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (user_id = auth.uid() or user_id is null)
  );

-- Não há policy de UPDATE nem de DELETE: log de auditoria é imutável para o client.
