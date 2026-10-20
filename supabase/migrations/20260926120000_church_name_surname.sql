-- ---------------------------------------------------------------------------
-- Nome e sobrenome da igreja
-- ---------------------------------------------------------------------------
-- A igreja passa a ter um NOME ("Assembleia de Deus Ministério no Ipiranga") e
-- um SOBRENOME opcional ("Vila Mariana - São Paulo"), que a distingue das irmãs de
-- mesmo nome. O nome pode ser herdado da igreja superior (o padrão do
-- ministério); o sobrenome é sempre individual.
--
-- Desenho: `churches.name` CONTINUA existindo e passa a guardar o nome
-- EFETIVO (o que aparece). Quem escreve são as colunas novas:
--   nome_proprio  — o nome que a própria igreja escolheu;
--   herdar_nome   — se true (e há igreja superior), name = name da superior.
-- Um trigger mantém `name` coerente e repassa a mudança para quem herda. Assim
-- as dezenas de leituras de `churches.name` (página pública, listas, e-mails,
-- RPCs) seguem funcionando sem mudar.

alter table public.churches
  add column if not exists nome_proprio text,
  add column if not exists sobrenome text,
  add column if not exists herdar_nome boolean not null default false;

-- Igrejas que já existem ficam com o nome de hoje e sem sobrenome: nada muda
-- na tela de ninguém.
update public.churches set nome_proprio = name where nome_proprio is null;
alter table public.churches alter column nome_proprio set not null;

alter table public.churches
  drop constraint if exists churches_nome_proprio_tamanho;
alter table public.churches
  add constraint churches_nome_proprio_tamanho
  check (char_length(btrim(nome_proprio)) between 1 and 200);

alter table public.churches
  drop constraint if exists churches_sobrenome_tamanho;
alter table public.churches
  add constraint churches_sobrenome_tamanho
  check (sobrenome is null or char_length(btrim(sobrenome)) between 1 and 120);

comment on column public.churches.name is
  'Nome EFETIVO (o que aparece): nome_proprio, ou o da igreja superior se herdar_nome. Derivado por trigger — escreva em nome_proprio.';
comment on column public.churches.herdar_nome is
  'Usa o nome da igreja superior. Sem superior, o trigger volta a false.';

-- Mantém `name` coerente. SECURITY DEFINER: lê a igreja superior, que pode ser
-- de outra empresa, e a policy de SELECT do usuário não é o que decide aqui.
create or replace function public.sync_church_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    -- Insert legado (que só conhece `name`) vira o nome próprio.
    new.nome_proprio := coalesce(nullif(btrim(coalesce(new.nome_proprio, '')), ''), new.name);
  elsif new.name is distinct from old.name
        and new.nome_proprio is not distinct from old.nome_proprio
        and not new.herdar_nome then
    -- Escrita direta em `name` (superuser/scripts): passa a ser o nome próprio.
    new.nome_proprio := new.name;
  end if;

  if new.parent_id is null then
    new.herdar_nome := false;
  end if;

  if new.herdar_nome then
    new.name := coalesce(
      (select p.name from public.churches p where p.id = new.parent_id),
      new.nome_proprio
    );
  else
    new.name := new.nome_proprio;
  end if;

  return new;
end;
$fn$;

revoke all on function public.sync_church_name() from public, anon, authenticated;

drop trigger if exists churches_sync_name on public.churches;
create trigger churches_sync_name
  before insert or update of name, nome_proprio, herdar_nome, parent_id
  on public.churches
  for each row
  execute function public.sync_church_name();

-- Quando o nome efetivo muda, quem herda acompanha (e as filhas delas, em
-- cascata: cada atualização dispara este mesmo gatilho no nível de baixo).
create or replace function public.cascade_church_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.churches
  set herdar_nome = herdar_nome
  where parent_id = new.id
    and herdar_nome
    and deleted_at is null;
  return null;
end;
$fn$;

revoke all on function public.cascade_church_name() from public, anon, authenticated;

drop trigger if exists churches_cascade_name on public.churches;
-- Sem `OF name`: o nome muda DENTRO do trigger anterior (o usuário grava
-- nome_proprio), e um gatilho por coluna só dispara para colunas do SET do
-- comando — mudanças feitas por outro trigger não contam.
create trigger churches_cascade_name
  after update on public.churches
  for each row
  when (old.name is distinct from new.name)
  execute function public.cascade_church_name();

-- ---------------------------------------------------------------------------
-- GRANTs: `churches` tem permissão por coluna. `name` deixa de ser escrito
-- pelo client (é derivado); as três colunas novas passam a ser. O sobrenome é
-- público, como o nome.
-- ---------------------------------------------------------------------------
revoke update (name) on public.churches from authenticated;
grant update (nome_proprio, sobrenome, herdar_nome) on public.churches to authenticated;
grant select (sobrenome) on public.churches to anon;

-- Nome + sobrenome para listas e mensagens ("Nome · Sobrenome"). Sem sobrenome,
-- só o nome.
create or replace function public.church_full_name(p_nome text, p_sobrenome text)
returns text
language sql
immutable
as $fn$
  select case
    when nullif(btrim(coalesce(p_sobrenome, '')), '') is null then p_nome
    else p_nome || ' · ' || btrim(p_sobrenome)
  end;
$fn$;

revoke all on function public.church_full_name(text, text) from public;
grant execute on function public.church_full_name(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Listas que mostram o nome da igreja passam a mostrar nome + sobrenome:
-- na árvore, várias igrejas dividem o mesmo nome e só o sobrenome as separa.
-- Mesmas assinaturas e mesmo retorno de antes (só o texto muda); `create or
-- replace` mantém os GRANTs de cada função.
-- ---------------------------------------------------------------------------

-- list_abuse_reports
create or replace function public.list_abuse_reports()
returns table (
  id uuid,
  sponsorship_id uuid,
  church_name text,
  sponsor_name text,
  sponsor_email text,
  logo_url text,
  motivo text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $fn$
  select
    r.id,
    r.sponsorship_id,
    public.church_full_name(c.name, c.sobrenome),
    sa.display_name,
    sa.email,
    sa.logo_url,
    r.motivo,
    r.created_at
  from public.sponsor_abuse_reports r
  join public.sponsorships s on s.id = r.sponsorship_id
  join public.churches c on c.id = s.church_id
  join public.sponsor_accounts sa on sa.id = s.sponsor_id
  where r.status = 'aberta'
    and public.is_platform_staff()
  order by r.created_at asc;
$fn$;

-- list_company_events
create or replace function public.list_company_events(p_company_id uuid)
returns table (
  id uuid,
  church_id uuid,
  church_name text,
  titulo text,
  descricao text,
  inicio timestamptz,
  fim timestamptz,
  local text,
  preco_cents integer,
  inscricoes_abertas boolean,
  inscritos integer
)
language sql
stable
set search_path = public
as $fn$
  select
    e.id,
    e.church_id,
    public.church_full_name(c.name, c.sobrenome),
    e.titulo,
    e.descricao,
    e.inicio,
    e.fim,
    e.local,
    e.preco_cents,
    e.inscricoes_abertas,
    (select count(*)::integer from public.event_signups s where s.event_id = e.id)
  from public.church_events e
  join public.churches c on c.id = e.church_id
  where e.company_id = p_company_id
    and e.deleted_at is null
  order by e.inicio asc;
$fn$;

-- list_company_sponsors
create or replace function public.list_company_sponsors(p_company_id uuid)
returns table (
  sponsorship_id uuid,
  church_id uuid,
  church_name text,
  sponsor_name text,
  logo_url text,
  status text,
  activated_at timestamptz,
  ends_at timestamptz,
  hidden_at timestamptz,
  denuncia_aberta boolean,
  em_carencia boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    s.id,
    s.church_id,
    public.church_full_name(c.name, c.sobrenome),
    sa.display_name,
    sa.logo_url,
    s.status,
    s.activated_at,
    s.ends_at,
    s.hidden_at,
    exists (
      select 1 from public.sponsor_abuse_reports r
      where r.sponsorship_id = s.id and r.status = 'aberta'
    ),
    public.sponsor_fora_da_vitrine(s.sponsor_id)
  from public.sponsorships s
  join public.churches c on c.id = s.church_id
  join public.sponsor_accounts sa on sa.id = s.sponsor_id
  where s.company_id = p_company_id
    and s.status in ('active', 'cancel_scheduled')
    and sa.deleted_at is null
  order by s.activated_at desc nulls last, s.created_at desc;
end;
$fn$;

-- prayer_counts_tree
create or replace function public.prayer_counts_tree(p_dias integer default 30)
returns table (church_id uuid, church_name text, total integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.church_id, public.church_full_name(c.name, c.sobrenome), count(*)::integer
  from public.prayer_requests p
  join public.churches c on c.id = p.church_id
  where public.can_admin_view_church(p.church_id)
    and p.created_at >= now() - make_interval(days => greatest(least(p_dias, 365), 1))
  group by 1, 2
  order by 3 desc, 2;
$$;

-- platform_list_churches
create or replace function public.platform_list_churches()
returns table (
  id uuid,
  name text,
  public_code text,
  tipo text,
  parent_id uuid,
  path text,
  company_id uuid,
  created_at timestamptz
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
  select c.id, public.church_full_name(c.name, c.sobrenome), c.public_code, c.tipo, c.parent_id, c.path::text, c.company_id, c.created_at
  from public.churches c
  where c.deleted_at is null
  order by c.path;
end;
$$;

-- sponsor_church_visits
create or replace function public.sponsor_church_visits(p_months integer default 6)
returns table (church_id uuid, church_name text, mes date, visitas integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.church_id,
    public.church_full_name(c.name, c.sobrenome),
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

-- platform_visits_by_week
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
    public.church_full_name(c.name, c.sobrenome),
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

notify pgrst, 'reload schema';
