-- subscriptions: assinatura de uma empresa a um plano. Tabela de negócio por tenant
-- (company_id) com soft delete (deleted_at) para preservar histórico de assinaturas
-- canceladas.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  external_subscription_id text,
  external_customer_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Só uma assinatura ATIVA (não soft-deletada) por empresa por vez; histórico de
-- assinaturas antigas fica preservado com deleted_at preenchido.
create unique index subscriptions_company_active_idx
  on public.subscriptions (company_id)
  where deleted_at is null;

create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

-- Ver GRANT no comentário de profiles: tabelas de dono "postgres" precisam de GRANT
-- explícito para authenticated, senão o acesso é negado antes da RLS ser avaliada.
grant select, insert, update on public.subscriptions to authenticated;

-- SELECT: dados de billing são sensíveis (ids do gateway de pagamento, status),
-- restritos a owner/admin. Se no futuro membros comuns precisarem só do "nome do plano
-- atual" para checar limites de feature, isso deve ser exposto por uma view/RPC
-- reduzida, não liberando a tabela inteira.
create policy "subscriptions_select_admin"
  on public.subscriptions
  for select
  to authenticated
  using (public.is_company_admin(company_id));

-- INSERT/UPDATE: decisões de billing (trocar de plano, cancelar) são restritas ao
-- owner da empresa, não a qualquer admin — mudanças automáticas vindas de webhook do
-- gateway de pagamento são feitas pelo servidor com service_role e não passam por RLS.
create policy "subscriptions_insert_owner"
  on public.subscriptions
  for insert
  to authenticated
  with check (public.is_company_owner(company_id));

create policy "subscriptions_update_owner"
  on public.subscriptions
  for update
  to authenticated
  using (public.is_company_owner(company_id))
  with check (public.is_company_owner(company_id));

-- Não há policy de DELETE: cancelamento é feito via UPDATE (status='canceled' e/ou
-- deleted_at), nunca hard delete.
