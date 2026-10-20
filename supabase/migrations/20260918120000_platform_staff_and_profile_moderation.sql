-- ---------------------------------------------------------------------------
-- Staff da plataforma e moderação do perfil do patrocinador
-- ---------------------------------------------------------------------------
-- Problema que esta migration fecha: `sponsor_accounts.display_name` e
-- `logo_url` são exibidos na página PÚBLICA da igreja, e até aqui o próprio
-- patrocinador tinha GRANT de update nas duas colunas. Sem tela, mas o
-- PostgREST é a API: uma conta invadida trocava o logo por qualquer coisa e
-- aquilo aparecia, na hora, na página que a igreja divulga.
--
-- Desenho escolhido: `sponsor_accounts` continua guardando o valor APROVADO
-- (nada muda em quem lê — list_church_sponsors, página pública, painel do
-- pastor). A alteração pedida vive em `sponsor_profile_changes` até alguém do
-- staff decidir. Aprovar é copiar para a conta.

-- ---------------------------------------------------------------------------
-- Staff da plataforma
-- ---------------------------------------------------------------------------
-- Eixo SEPARADO dos papéis de empresa (owner/admin/member). Quem modera
-- atravessa o isolamento entre tenants por definição, então não ganha SELECT
-- nas tabelas dos clientes: ganha execute nas RPCs de moderação, e só.
create table if not exists public.platform_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Guardado por conveniência de leitura no painel; a verdade é auth.users.
  email text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.platform_staff is
  'Operadores da plataforma (moderação). Não é papel de empresa.';

alter table public.platform_staff enable row level security;
revoke all on public.platform_staff from anon, authenticated;

create or replace function public.is_platform_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.platform_staff ps
    where ps.user_id = auth.uid()
      and ps.deleted_at is null
  );
$$;

revoke all on function public.is_platform_staff() from public, anon;
grant execute on function public.is_platform_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- Auditoria do staff
-- ---------------------------------------------------------------------------
-- `audit_logs.company_id` é NOT NULL e aponta para uma empresa: decisão de
-- staff não pertence a nenhuma, atravessa todas. Afrouxar aquele company_id
-- obrigaria revisar toda policy de empresa para excluir NULL — o tipo de
-- mudança que abre brecha em silêncio. Log próprio, então.
create table if not exists public.platform_staff_actions (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references auth.users (id) on delete restrict,
  action text not null,
  entity_type text,
  entity_id uuid,
  -- Como a decisão chegou: painel hoje, bot do Telegram depois.
  via text not null default 'painel' check (via in ('painel', 'telegram', 'api')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_staff_actions_created_idx
  on public.platform_staff_actions (created_at desc);

alter table public.platform_staff_actions enable row level security;
revoke all on public.platform_staff_actions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conta do patrocinador: trava de segurança
-- ---------------------------------------------------------------------------
-- Marcada quando o dono do email clica em "não fui eu". Enquanto estiver
-- marcada, a conta não pede novas alterações.
alter table public.sponsor_accounts
  add column if not exists security_hold_at timestamptz;

-- O buraco: essas duas colunas aparecem em página pública.
revoke update (display_name, logo_url) on public.sponsor_accounts from authenticated;

-- ---------------------------------------------------------------------------
-- Alterações de perfil
-- ---------------------------------------------------------------------------
create table if not exists public.sponsor_profile_changes (
  id uuid primary key default gen_random_uuid(),
  sponsor_account_id uuid not null
    references public.sponsor_accounts (id) on delete cascade,
  -- NULL = não mexeu nesse campo.
  novo_display_name text check (novo_display_name is null or char_length(novo_display_name) between 2 and 120),
  novo_logo_path text,
  -- Retrato do que valia quando o pedido foi feito. Dá o "não fui eu" e a
  -- auditoria de graça, sem versionar o perfil inteiro.
  anterior_display_name text not null,
  anterior_logo_url text,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'recusada', 'substituida', 'revertida')),
  motivo_recusa text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decided_via text check (decided_via in ('painel', 'telegram', 'api')),
  -- Só o hash: o texto do token vai no email e não é guardado aqui.
  cancel_token_hash text not null,
  token_expira_em timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_profile_changes_tem_o_que_mudar check (
    novo_display_name is not null or novo_logo_path is not null
  )
);

comment on table public.sponsor_profile_changes is
  'Pedido de alteração de nome/logo do patrocinador, à espera do staff.';

drop trigger if exists set_sponsor_profile_changes_updated_at on public.sponsor_profile_changes;
create trigger set_sponsor_profile_changes_updated_at
  before update on public.sponsor_profile_changes
  for each row
  execute function public.set_updated_at();

-- Um pendente por conta: pedido novo substitui o anterior, para o staff não
-- julgar uma fila de cinco versões da mesma pessoa.
create unique index if not exists sponsor_profile_changes_um_pendente
  on public.sponsor_profile_changes (sponsor_account_id)
  where status = 'pendente';

create index if not exists sponsor_profile_changes_token_idx
  on public.sponsor_profile_changes (cancel_token_hash);

alter table public.sponsor_profile_changes enable row level security;
revoke all on public.sponsor_profile_changes from anon, authenticated;
-- Leitura da própria conta (o patrocinador vê o que pediu). Escrita é só
-- pelas RPCs abaixo.
grant select on public.sponsor_profile_changes to authenticated;

create policy "sponsor_profile_changes_select_own"
  on public.sponsor_profile_changes for select
  to authenticated
  using (
    sponsor_account_id in (
      select sa.id from public.sponsor_accounts sa
      where sa.user_id = auth.uid() and sa.deleted_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Patrocinador pede alteração. Nada reflete em página nenhuma até o staff
-- aprovar: a conta segue com o valor antigo.
-- O token do "não fui eu" chega já hasheado — o texto puro vive só no email.
create or replace function public.request_sponsor_profile_change(
  p_display_name text,
  p_logo_path text,
  p_token_hash text,
  p_token_expira timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_account public.sponsor_accounts%rowtype;
  v_nome text;
  v_id uuid;
begin
  select * into v_account
  from public.sponsor_accounts
  where user_id = auth.uid() and deleted_at is null;

  if v_account.id is null then
    raise exception 'Conta de patrocinador não encontrada' using errcode = 'P0002';
  end if;

  if v_account.security_hold_at is not null then
    raise exception 'Conta bloqueada por segurança. Fale com o suporte.' using errcode = 'P0001';
  end if;

  v_nome := nullif(btrim(coalesce(p_display_name, '')), '');

  -- Pedir o nome que já está valendo não vira fila para ninguém julgar.
  if v_nome is not null and v_nome = v_account.display_name then
    v_nome := null;
  end if;

  if v_nome is null and p_logo_path is null then
    raise exception 'Nada a alterar' using errcode = 'P0001';
  end if;

  update public.sponsor_profile_changes
  set status = 'substituida'
  where sponsor_account_id = v_account.id and status = 'pendente';

  insert into public.sponsor_profile_changes (
    sponsor_account_id, novo_display_name, novo_logo_path,
    anterior_display_name, anterior_logo_url,
    cancel_token_hash, token_expira_em
  )
  values (
    v_account.id, v_nome, p_logo_path,
    v_account.display_name, v_account.logo_url,
    p_token_hash, p_token_expira
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

-- "Não fui eu", do email. Roda SEM sessão: quem prova ser o dono é quem tem
-- o token. Desfaz o pedido (e o que já tiver sido aplicado) e tranca a conta
-- para novas alterações até o suporte destravar.
create or replace function public.cancel_profile_change_by_token(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_change public.sponsor_profile_changes%rowtype;
begin
  select * into v_change
  from public.sponsor_profile_changes
  where cancel_token_hash = p_token_hash
    and token_expira_em > now()
    and status in ('pendente', 'aprovada')
  limit 1;

  if v_change.id is null then
    return false;
  end if;

  -- Se já tinha sido aprovada, volta ao retrato guardado no pedido.
  if v_change.status = 'aprovada' then
    update public.sponsor_accounts
    set display_name = v_change.anterior_display_name,
        logo_url = v_change.anterior_logo_url
    where id = v_change.sponsor_account_id;
  end if;

  update public.sponsor_profile_changes
  set status = 'revertida', decided_at = now(), decided_via = 'api'
  where id = v_change.id;

  update public.sponsor_accounts
  set security_hold_at = now()
  where id = v_change.sponsor_account_id;

  return true;
end;
$fn$;

-- Fila do staff: o que foi pedido, o que vale hoje e quem é o patrocinador.
create or replace function public.list_pending_profile_changes()
returns table (
  id uuid,
  sponsor_account_id uuid,
  sponsor_email text,
  novo_display_name text,
  novo_logo_path text,
  atual_display_name text,
  atual_logo_url text,
  igrejas integer,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $fn$
  select
    c.id,
    c.sponsor_account_id,
    sa.email,
    c.novo_display_name,
    c.novo_logo_path,
    sa.display_name,
    sa.logo_url,
    (
      select count(*)::integer
      from public.sponsorships s
      where s.sponsor_id = sa.id
        and s.status in ('active', 'cancel_scheduled')
    ),
    c.created_at
  from public.sponsor_profile_changes c
  join public.sponsor_accounts sa on sa.id = c.sponsor_account_id
  where c.status = 'pendente'
    and public.is_platform_staff()
  order by c.created_at asc;
$fn$;

-- Decisão do staff. Aprovar copia para a conta — é aqui, e só aqui, que o
-- nome e o logo públicos mudam.
-- `p_logo_url` é a URL final do arquivo já movido para a pasta pública; quem
-- sabe montar essa URL é o storage, não o banco.
create or replace function public.review_profile_change(
  p_change_id uuid,
  p_aprovada boolean,
  p_motivo text default null,
  p_via text default 'painel',
  p_logo_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_change public.sponsor_profile_changes%rowtype;
begin
  if not public.is_platform_staff() then
    raise exception 'Apenas a moderação da plataforma pode decidir isso' using errcode = '42501';
  end if;

  select * into v_change
  from public.sponsor_profile_changes
  where id = p_change_id and status = 'pendente';

  if v_change.id is null then
    return false;
  end if;

  if not p_aprovada and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Recusa exige motivo' using errcode = 'P0001';
  end if;

  if p_aprovada then
    update public.sponsor_accounts
    set display_name = coalesce(v_change.novo_display_name, display_name),
        logo_url = case
          when v_change.novo_logo_path is null then logo_url
          else p_logo_url
        end
    where id = v_change.sponsor_account_id;
  end if;

  update public.sponsor_profile_changes
  set status = case when p_aprovada then 'aprovada' else 'recusada' end,
      motivo_recusa = case when p_aprovada then null else p_motivo end,
      decided_by = auth.uid(),
      decided_at = now(),
      decided_via = p_via
  where id = v_change.id;

  insert into public.platform_staff_actions (staff_user_id, action, entity_type, entity_id, via, metadata)
  values (
    auth.uid(),
    case when p_aprovada then 'sponsor_profile.aprovada' else 'sponsor_profile.recusada' end,
    'sponsor_profile_change',
    v_change.id,
    p_via,
    jsonb_build_object('sponsor_account_id', v_change.sponsor_account_id)
  );

  return true;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- GRANTs das funções (o default do Postgres é execute para todo mundo)
-- ---------------------------------------------------------------------------
revoke all on function public.request_sponsor_profile_change(text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.cancel_profile_change_by_token(text) from public, anon, authenticated;
revoke all on function public.list_pending_profile_changes() from public, anon, authenticated;
revoke all on function public.review_profile_change(uuid, boolean, text, text, text) from public, anon, authenticated;

grant execute on function public.request_sponsor_profile_change(text, text, text, timestamptz) to authenticated;
-- Sem sessão: o link do email é aberto por quem está deslogado.
grant execute on function public.cancel_profile_change_by_token(text) to anon, authenticated;
grant execute on function public.list_pending_profile_changes() to authenticated;
grant execute on function public.review_profile_change(uuid, boolean, text, text, text) to authenticated;

notify pgrst, 'reload schema';
