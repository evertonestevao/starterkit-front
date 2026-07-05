-- plans: catálogo global de planos de assinatura (Free, Pro, etc). Não é tabela de
-- negócio por tenant (sem company_id): planos são compartilhados por todas as empresas,
-- só a assinatura (subscriptions) é por empresa. deleted_at aqui serve para "aposentar"
-- um plano antigo sem quebrar assinaturas existentes que ainda referenciam esse id.
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_cents integer not null default 0,
  currency text not null default 'BRL',
  billing_interval text not null default 'month'
    check (billing_interval in ('month', 'year')),
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_plans_updated_at
  before update on public.plans
  for each row
  execute function public.set_updated_at();

alter table public.plans enable row level security;

-- Ver GRANT no comentário de profiles: tabelas de dono "postgres" precisam de GRANT
-- explícito para anon/authenticated, senão o acesso é negado antes da RLS ser avaliada.
grant select on public.plans to anon, authenticated;

-- SELECT: página de preços é pública, então visitantes anônimos podem ver os planos
-- ativos e não deletados.
create policy "plans_select_public_active"
  on public.plans
  for select
  to anon, authenticated
  using (deleted_at is null and is_active);

-- SELECT: usuário autenticado também pode ver planos inativos (mas não deletados),
-- necessário para exibir corretamente o nome/preço do plano de uma empresa que está
-- numa assinatura antiga/legada de um plano descontinuado.
create policy "plans_select_authenticated_all"
  on public.plans
  for select
  to authenticated
  using (deleted_at is null);

-- Não há policy de INSERT/UPDATE/DELETE: catálogo de planos é gerenciado só via
-- migration ou painel administrativo com service_role.
