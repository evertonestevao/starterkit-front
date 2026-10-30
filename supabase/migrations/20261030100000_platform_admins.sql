-- platform_admins: quem administra a plataforma inteira (super_admin), acima das
-- empresas. Não tem company_id nem deleted_at de propósito: é um papel global, como o
-- catálogo roles. Não vira coluna em profiles porque o usuário tem UPDATE na própria
-- linha de profiles e poderia se promover sozinho.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- Só leitura: a concessão é feita fora do client. O revoke é explícito porque, conforme
-- a versão do Supabase, as default privileges já dão acesso total a anon/authenticated
-- em tabela nova do schema public.
revoke all on public.platform_admins from anon, authenticated;
grant select on public.platform_admins to authenticated;

-- SELECT: cada usuário só descobre se ele mesmo é admin da plataforma.
create policy "platform_admins_select_self"
  on public.platform_admins
  for select
  to authenticated
  using (user_id = auth.uid());

-- Sem policies de INSERT/UPDATE/DELETE: ninguém se concede o papel pela aplicação.

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
