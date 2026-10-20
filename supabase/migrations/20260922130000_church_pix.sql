-- ---------------------------------------------------------------------------
-- A igreja cadastra a própria chave PIX + contagem de "copiei a chave"
-- ---------------------------------------------------------------------------
-- Até aqui a chave PIX só entrava por SQL. Ela ganha tela, e com ela o
-- cuidado que o comentário da migration 20260919200000 já pedia: esta é a
-- coluna mais valiosa da tabela para um golpista, porque quem troca a chave
-- desvia as doações sem ninguém perceber. Por isso a troca, na aplicação,
-- passa por confirmação, vira registro em `audit_logs` e dispara email para
-- todos os administradores da empresa.
--
-- No banco, a barreira é a de sempre: GRANT por coluna + a policy de admin.
-- Member não escreve a chave.
grant update (pix_chave, pix_titular) on public.churches to authenticated;

-- ---------------------------------------------------------------------------
-- "Copiei a chave": o único sinal de doação que a plataforma tem
-- ---------------------------------------------------------------------------
-- No v1 o dízimo vai direto do banco de quem doa para o da igreja, e a
-- plataforma não vê nada disso — não sabe se doou, nem quanto. O que dá para
-- medir é a INTENÇÃO: quantas vezes alguém copiou a chave. Não é doação e não
-- deve ser lido como tal.
--
-- Mesmas regras das visitas: nada de IP, user-agent ou cookie, robô não
-- conta, e só service_role grava.
create table if not exists public.church_pix_copies (
  id bigint generated always as identity primary key,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.church_pix_copies is
  'Vezes que alguém copiou a chave PIX da igreja. Intenção de doar, não doação.';

create index if not exists church_pix_copies_church_idx
  on public.church_pix_copies (church_id, created_at desc);

drop trigger if exists set_church_pix_copies_company_id on public.church_pix_copies;
create trigger set_church_pix_copies_company_id
  before insert or update of church_id on public.church_pix_copies
  for each row execute function public.set_company_id_from_church();

alter table public.church_pix_copies enable row level security;
revoke all on public.church_pix_copies from anon, authenticated;

grant select on public.church_pix_copies to authenticated;
create policy "church_pix_copies_select_tree"
  on public.church_pix_copies for select
  to authenticated
  using (public.can_view_church(church_id));

grant select, insert on public.church_pix_copies to service_role;

create or replace function public.platform_pix_copies_by_week(p_weeks integer default 8)
returns table (church_id uuid, church_name text, semana date, copias integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_staff() then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    p.church_id,
    c.name,
    date_trunc('week', p.created_at at time zone 'America/Sao_Paulo')::date,
    count(*)::integer
  from public.church_pix_copies p
  join public.churches c on c.id = p.church_id
  where p.created_at >= now() - make_interval(weeks => greatest(least(p_weeks, 52), 1))
  group by 1, 2, 3
  order by 3 desc, 2;
end;
$$;

revoke all on function public.platform_pix_copies_by_week(integer) from public, anon, authenticated;
grant execute on function public.platform_pix_copies_by_week(integer) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Para quem vai o aviso de troca de chave
-- ---------------------------------------------------------------------------
-- Os emails estão em `auth.users`, que o client não alcança. Esta função
-- devolve SÓ os emails de quem administra a empresa de quem pergunta — e a
-- pessoa já convive com essas contas na tela de equipe.
create or replace function public.company_admin_emails(p_company_id uuid)
returns table (email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  return query
  select u.email::text
  from public.company_members cm
  join auth.users u on u.id = cm.user_id
  where cm.company_id = p_company_id
    and cm.deleted_at is null
    and cm.role in ('owner', 'admin')
    and u.email is not null;
end;
$$;

revoke all on function public.company_admin_emails(uuid) from public, anon, authenticated;
grant execute on function public.company_admin_emails(uuid) to authenticated;

notify pgrst, 'reload schema';
