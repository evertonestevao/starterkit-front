-- ---------------------------------------------------------------------------
-- Visitas à página pública da igreja (link, QR Code, tag NFC)
-- ---------------------------------------------------------------------------
-- Por que agora, antes das telas: visita que não foi gravada não volta. As
-- métricas do piloto (escaneamentos por igreja por semana) e a do
-- patrocinador (quantas vezes a página onde a marca dele aparece foi aberta)
-- saem desta tabela — se ela só nascer no meio do piloto, o começo se perde.
--
-- O que NÃO se guarda: IP, user-agent, cookie, nada que identifique quem
-- visitou (LGPD). Uma linha é "alguém abriu a página desta igreja, por este
-- caminho, nesta hora". A deduplicação (a mesma pessoa recarregando) é feita
-- no servidor, antes de gravar, com o rate limiter — o IP nunca chega aqui.
--
-- ESCRITA: só service_role (o servidor, depois de filtrar robô, prefetch e
-- repetição). Não há GRANT de insert para anon: com a chave pública, qualquer
-- um inflaria o número que o patrocinador vê.

create table if not exists public.church_page_visits (
  id bigint generated always as identity primary key,
  church_id uuid not null references public.churches (id) on delete cascade,
  -- Regra do projeto: tabela de negócio tem company_id. Preenchido pelo
  -- trigger a partir da igreja, nunca por quem grava.
  company_id uuid references public.companies (id) on delete cascade,
  -- Como a pessoa chegou. 'link' = sem marcação (compartilhado, digitado ou
  -- QR/NFC impresso SEM o parâmetro de origem).
  origem text not null check (origem in ('link', 'qr', 'nfc')),
  created_at timestamptz not null default now()
);

comment on table public.church_page_visits is
  'Aberturas da página pública da igreja. Sem dado de quem visitou.';

create index if not exists church_page_visits_church_idx
  on public.church_page_visits (church_id, created_at desc);

drop trigger if exists set_church_page_visits_company_id on public.church_page_visits;
create trigger set_church_page_visits_company_id
  before insert or update of church_id on public.church_page_visits
  for each row execute function public.set_company_id_from_church();

alter table public.church_page_visits enable row level security;
revoke all on public.church_page_visits from anon, authenticated;

-- A igreja (e quem está acima dela na árvore) lê as próprias visitas.
grant select on public.church_page_visits to authenticated;
create policy "church_page_visits_select_tree"
  on public.church_page_visits for select
  to authenticated
  using (public.can_view_church(church_id));

grant select, insert on public.church_page_visits to service_role;

-- ---------------------------------------------------------------------------
-- Patrocinador: visitas por igreja por mês, só enquanto a marca estava lá
-- ---------------------------------------------------------------------------
-- Conta a visita só dentro do período em que o patrocínio estava no ar
-- (ativado, antes do fim e antes de a igreja esconder a marca). Fora disso a
-- página foi aberta, mas a marca não estava nela.
create or replace function public.sponsor_church_visits(p_months integer default 6)
returns table (church_id uuid, church_name text, mes date, visitas integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.church_id,
    c.name,
    date_trunc('month', v.created_at at time zone 'America/Sao_Paulo')::date,
    count(*)::integer
  from public.sponsorships s
  join public.sponsor_accounts sa
    on sa.id = s.sponsor_id and sa.user_id = auth.uid() and sa.deleted_at is null
  join public.churches c on c.id = s.church_id
  join public.church_page_visits v
    on v.church_id = s.church_id
   and v.created_at >= s.activated_at
   and (s.ends_at is null or v.created_at < s.ends_at)
   and (s.hidden_at is null or v.created_at < s.hidden_at)
  where s.activated_at is not null
    and v.created_at >= (date_trunc('month', now() at time zone 'America/Sao_Paulo')
                         - make_interval(months => greatest(least(p_months, 24), 1) - 1))
                         at time zone 'America/Sao_Paulo'
  -- Por posição: os nomes de saída da função colidiriam com os das colunas.
  group by 1, 2, 3
  order by 3 desc, 2;
$$;

revoke all on function public.sponsor_church_visits(integer) from public, anon, authenticated;
grant execute on function public.sponsor_church_visits(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Plataforma: números do piloto
-- ---------------------------------------------------------------------------
-- Agregados, nunca linhas de cliente: a moderação não ganha SELECT nas
-- tabelas (regra do projeto), ganha estas contagens.
create or replace function public.platform_pilot_summary()
returns table (
  patrocinadores_pagantes integer,
  patrocinadores_em_atraso integer,
  patrocinios_no_ar integer,
  cobrancas_pagas integer,
  renovacoes integer,
  recebido_mes_cents bigint
)
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
  with pagas as (
    select ch.sponsor_id, ch.amount_cents, ch.paid_at,
           row_number() over (partition by ch.sponsor_id order by ch.due_date, ch.created_at) as n
    from public.sponsor_charges ch
    where ch.status = 'paid'
  )
  select
    (select count(*)::integer from public.sponsor_accounts
      where deleted_at is null and billing_status = 'active'),
    (select count(*)::integer from public.sponsor_accounts
      where deleted_at is null and billing_status = 'overdue'),
    (select count(*)::integer from public.sponsorships
      where status in ('active', 'cancel_scheduled') and hidden_at is null),
    (select count(*)::integer from pagas),
    -- Renovação = cobrança paga que não é a primeira daquele patrocinador.
    (select count(*)::integer from pagas where n > 1),
    (select coalesce(sum(amount_cents), 0)::bigint from pagas
      where paid_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
end;
$$;

create or replace function public.platform_visits_by_week(p_weeks integer default 8)
returns table (
  church_id uuid,
  church_name text,
  semana date,
  total integer,
  qr integer,
  nfc integer
)
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
    v.church_id,
    c.name,
    date_trunc('week', v.created_at at time zone 'America/Sao_Paulo')::date,
    count(*)::integer,
    (count(*) filter (where v.origem = 'qr'))::integer,
    (count(*) filter (where v.origem = 'nfc'))::integer
  from public.church_page_visits v
  join public.churches c on c.id = v.church_id
  where v.created_at >= now() - make_interval(weeks => greatest(least(p_weeks, 52), 1))
  group by 1, 2, 3
  order by 3 desc, 2;
end;
$$;

revoke all on function public.platform_pilot_summary() from public, anon, authenticated;
revoke all on function public.platform_visits_by_week(integer) from public, anon, authenticated;
grant execute on function public.platform_pilot_summary() to authenticated;
grant execute on function public.platform_visits_by_week(integer) to authenticated;

notify pgrst, 'reload schema';
