-- ---------------------------------------------------------------------------
-- Igreja esconde patrocinador e denuncia abuso
-- ---------------------------------------------------------------------------
-- A moderação da plataforma (migration 20260918120000) resolve o caso de
-- conta invadida e de conteúdo fora do padrão. Não resolve o outro caso: a
-- igreja simplesmente não querer aquela marca associada a ela. Essa decisão é
-- só dela, não passa por ninguém, e não mexe na cobrança — o patrocinador
-- continua pagando e some da página.
--
-- Denúncia é o caminho oposto: a igreja não decide sozinha, manda o caso para
-- a plataforma olhar.

-- ---------------------------------------------------------------------------
-- Esconder: coluna no próprio patrocínio
-- ---------------------------------------------------------------------------
-- Tabela separada seria redundante: `sponsorships` já é o par
-- (patrocinador, igreja).
alter table public.sponsorships
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references auth.users (id) on delete set null,
  add column if not exists hidden_reason text;

comment on column public.sponsorships.hidden_at is
  'Escondido pela igreja. Não altera cobrança nem status do patrocínio.';

-- ---------------------------------------------------------------------------
-- Denúncias
-- ---------------------------------------------------------------------------
create table if not exists public.sponsor_abuse_reports (
  id uuid primary key default gen_random_uuid(),
  sponsorship_id uuid not null references public.sponsorships (id) on delete cascade,
  -- Regra do projeto: tabela de negócio carrega company_id.
  company_id uuid not null references public.companies (id) on delete cascade,
  reported_by uuid references auth.users (id) on delete set null,
  motivo text not null check (char_length(motivo) between 5 and 1000),
  status text not null default 'aberta'
    check (status in ('aberta', 'procedente', 'improcedente')),
  nota_moderacao text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decided_via text check (decided_via in ('painel', 'telegram', 'api')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sponsor_abuse_reports is
  'Denúncia de uma igreja sobre um patrocinador que aparece na página dela.';

create index if not exists sponsor_abuse_reports_abertas_idx
  on public.sponsor_abuse_reports (created_at desc)
  where status = 'aberta';

-- Uma denúncia aberta por patrocínio: insistir não acelera a fila.
create unique index if not exists sponsor_abuse_reports_uma_aberta
  on public.sponsor_abuse_reports (sponsorship_id)
  where status = 'aberta';

drop trigger if exists set_sponsor_abuse_reports_updated_at on public.sponsor_abuse_reports;
create trigger set_sponsor_abuse_reports_updated_at
  before update on public.sponsor_abuse_reports
  for each row
  execute function public.set_updated_at();

alter table public.sponsor_abuse_reports enable row level security;
revoke all on public.sponsor_abuse_reports from anon, authenticated;
grant select on public.sponsor_abuse_reports to authenticated;

-- A igreja acompanha o que ela mesma denunciou. Escrita só pelas RPCs.
create policy "sponsor_abuse_reports_select_own_company"
  on public.sponsor_abuse_reports for select
  to authenticated
  using (public.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- A vitrine pública passa a respeitar o escondido
-- ---------------------------------------------------------------------------
create or replace function public.list_church_sponsors(p_church_id uuid)
returns table (sponsorship_id uuid, display_name text, logo_url text)
language sql
stable
security definer
set search_path = public
as $fn$
  select s.id, sa.display_name, sa.logo_url
  from public.sponsorships s
  join public.sponsor_accounts sa on sa.id = s.sponsor_id
  where s.church_id = p_church_id
    and s.status in ('active', 'cancel_scheduled')
    and sa.deleted_at is null
    and s.hidden_at is null
  order by s.created_at asc, s.id asc;
$fn$;

-- E o painel da igreja passa a ver quem ela escondeu (para poder desfazer).
-- Ganha colunas novas, então precisa cair antes: `create or replace` não muda
-- o tipo de retorno de uma função existente.
drop function if exists public.list_company_sponsors(uuid);
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
  denuncia_aberta boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  -- security definer ignora RLS: a checagem de acesso é esta linha.
  if not public.is_company_member(p_company_id) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    s.id,
    s.church_id,
    c.name,
    sa.display_name,
    sa.logo_url,
    s.status,
    s.activated_at,
    s.ends_at,
    s.hidden_at,
    exists (
      select 1 from public.sponsor_abuse_reports r
      where r.sponsorship_id = s.id and r.status = 'aberta'
    )
  from public.sponsorships s
  join public.churches c on c.id = s.church_id
  join public.sponsor_accounts sa on sa.id = s.sponsor_id
  where s.company_id = p_company_id
    and s.status in ('active', 'cancel_scheduled')
    and sa.deleted_at is null
  order by s.activated_at desc nulls last, s.created_at desc;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- RPCs da igreja
-- ---------------------------------------------------------------------------

-- Esconder/reexibir. Decisão unilateral de quem administra a igreja: não
-- passa pela moderação e não toca na cobrança.
create or replace function public.set_sponsorship_hidden(
  p_sponsorship_id uuid,
  p_hidden boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company uuid;
begin
  select company_id into v_company
  from public.sponsorships
  where id = p_sponsorship_id;

  if v_company is null then
    raise exception 'Patrocínio não encontrado' using errcode = 'P0002';
  end if;

  if not public.is_company_admin(v_company) then
    raise exception 'Só quem administra a igreja pode fazer isso' using errcode = '42501';
  end if;

  update public.sponsorships
  set hidden_at = case when p_hidden then now() else null end,
      hidden_by = case when p_hidden then auth.uid() else null end,
      hidden_reason = case when p_hidden then nullif(btrim(coalesce(p_reason, '')), '') else null end
  where id = p_sponsorship_id;

  return true;
end;
$fn$;

-- Denunciar. Diferente de esconder: aqui a igreja pede que a plataforma olhe.
create or replace function public.report_sponsor_abuse(
  p_sponsorship_id uuid,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company uuid;
  v_id uuid;
begin
  select company_id into v_company
  from public.sponsorships
  where id = p_sponsorship_id;

  if v_company is null then
    raise exception 'Patrocínio não encontrado' using errcode = 'P0002';
  end if;

  -- Membro basta: quem cuida da página costuma não ser o dono da conta.
  if not public.is_company_member(v_company) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  insert into public.sponsor_abuse_reports (sponsorship_id, company_id, reported_by, motivo)
  values (p_sponsorship_id, v_company, auth.uid(), btrim(p_motivo))
  on conflict (sponsorship_id) where status = 'aberta' do nothing
  returning id into v_id;

  -- Já havia denúncia aberta: devolve a existente em vez de estourar.
  if v_id is null then
    select id into v_id from public.sponsor_abuse_reports
    where sponsorship_id = p_sponsorship_id and status = 'aberta';
  end if;

  return v_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- RPCs da moderação
-- ---------------------------------------------------------------------------

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
    c.name,
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

create or replace function public.review_abuse_report(
  p_report_id uuid,
  p_procedente boolean,
  p_nota text default null,
  p_via text default 'painel'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_report public.sponsor_abuse_reports%rowtype;
begin
  if not public.is_platform_staff() then
    raise exception 'Apenas a moderação da plataforma pode decidir isso' using errcode = '42501';
  end if;

  select * into v_report
  from public.sponsor_abuse_reports
  where id = p_report_id and status = 'aberta';

  if v_report.id is null then
    return false;
  end if;

  update public.sponsor_abuse_reports
  set status = case when p_procedente then 'procedente' else 'improcedente' end,
      nota_moderacao = nullif(btrim(coalesce(p_nota, '')), ''),
      decided_by = auth.uid(),
      decided_at = now(),
      decided_via = p_via
  where id = v_report.id;

  insert into public.platform_staff_actions (staff_user_id, action, entity_type, entity_id, via, metadata)
  values (
    auth.uid(),
    case when p_procedente then 'abuse.procedente' else 'abuse.improcedente' end,
    'sponsor_abuse_report',
    v_report.id,
    p_via,
    jsonb_build_object('sponsorship_id', v_report.sponsorship_id)
  );

  return true;
end;
$fn$;

-- Sinal para a moderação: patrocinador escondido por MAIS DE UMA igreja.
-- Uma igreja esconder é gosto; várias esconderem o mesmo é problema, e
-- aparece antes de alguém se dar ao trabalho de denunciar.
create or replace function public.list_hidden_signals()
returns table (
  sponsor_account_id uuid,
  sponsor_name text,
  sponsor_email text,
  igrejas_que_esconderam integer
)
language sql
security definer
set search_path = public
stable
as $fn$
  select
    sa.id,
    sa.display_name,
    sa.email,
    count(*)::integer
  from public.sponsorships s
  join public.sponsor_accounts sa on sa.id = s.sponsor_id
  where s.hidden_at is not null
    and public.is_platform_staff()
  group by sa.id, sa.display_name, sa.email
  having count(*) > 1
  order by count(*) desc;
$fn$;

-- ---------------------------------------------------------------------------
-- GRANTs das funções
-- ---------------------------------------------------------------------------
revoke all on function public.set_sponsorship_hidden(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.report_sponsor_abuse(uuid, text) from public, anon, authenticated;
revoke all on function public.list_abuse_reports() from public, anon, authenticated;
revoke all on function public.review_abuse_report(uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.list_hidden_signals() from public, anon, authenticated;
revoke all on function public.list_company_sponsors(uuid) from public, anon, authenticated;
revoke all on function public.list_church_sponsors(uuid) from public, anon, authenticated;

grant execute on function public.set_sponsorship_hidden(uuid, boolean, text) to authenticated;
grant execute on function public.report_sponsor_abuse(uuid, text) to authenticated;
grant execute on function public.list_abuse_reports() to authenticated;
grant execute on function public.review_abuse_report(uuid, boolean, text, text) to authenticated;
grant execute on function public.list_hidden_signals() to authenticated;
grant execute on function public.list_company_sponsors(uuid) to authenticated;
-- A vitrine é pública: a página da igreja abre sem login.
grant execute on function public.list_church_sponsors(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
