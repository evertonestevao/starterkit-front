-- ---------------------------------------------------------------------------
-- Link do patrocinador (site ou WhatsApp)
-- ---------------------------------------------------------------------------
-- A logo do patrocinador, na página pública da igreja, passa a abrir um
-- destino escolhido por ele: um site ou um número de WhatsApp (o link
-- `wa.me` é montado pelo app).
--
-- Isso é conteúdo que aparece em página pública e leva quem clica para FORA
-- da plataforma — o vetor clássico de phishing. Então segue exatamente o
-- caminho do nome e do logo: as colunas em `sponsor_accounts` guardam o valor
-- APROVADO, o dono da conta não tem GRANT de escrita nelas, e a alteração vira
-- pedido em `sponsor_profile_changes` até a moderação decidir.
--
-- Guardamos (tipo, valor), nunca um href pronto: o endereço do WhatsApp é
-- sempre montado por nós, e o CHECK abaixo só deixa entrar http(s):// no tipo
-- "link" — `javascript:` e afins não passam nem por quem tem service_role
-- distraído.

-- ---------------------------------------------------------------------------
-- Conta: valor aprovado
-- ---------------------------------------------------------------------------
alter table public.sponsor_accounts
  add column if not exists link_tipo text,
  add column if not exists link_valor text;

alter table public.sponsor_accounts
  drop constraint if exists sponsor_accounts_link_valido;
alter table public.sponsor_accounts
  add constraint sponsor_accounts_link_valido check (
    (link_tipo is null and link_valor is null)
    or (link_tipo = 'link'
        and link_valor ~* '^https?://[^[:space:]]+$'
        and char_length(link_valor) <= 300)
    or (link_tipo = 'whatsapp' and link_valor ~ '^[0-9]{10,15}$')
  );

comment on column public.sponsor_accounts.link_tipo is
  'link | whatsapp. Aparece na página pública: só a moderação escreve (via review_profile_change).';

-- Nada a fazer nos GRANTs, e é de propósito: `authenticated` tem SELECT na
-- tabela inteira (o dono lê a própria conta) e UPDATE só em colunas
-- nomeadas (display_name, phone, logo_url — e as duas primeiras/última foram
-- revogadas em 20260918120000). Coluna nova nasce sem UPDATE para o client.
-- Reafirmado aqui para que um GRANT futuro de tabela inteira não passe
-- despercebido: a moderação exige que continue assim.
revoke update (link_tipo, link_valor) on public.sponsor_accounts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pedido de alteração
-- ---------------------------------------------------------------------------
-- `novo_link_alterado` distingue "não mexeu no link" de "quer REMOVER o link"
-- (os dois teriam tipo/valor NULL).
alter table public.sponsor_profile_changes
  add column if not exists novo_link_alterado boolean not null default false,
  add column if not exists novo_link_tipo text,
  add column if not exists novo_link_valor text,
  -- Retrato do que valia, para o "não fui eu" voltar ao estado anterior.
  add column if not exists anterior_link_tipo text,
  add column if not exists anterior_link_valor text;

alter table public.sponsor_profile_changes
  drop constraint if exists sponsor_profile_changes_link_valido;
alter table public.sponsor_profile_changes
  add constraint sponsor_profile_changes_link_valido check (
    (novo_link_tipo is null and novo_link_valor is null)
    or (novo_link_alterado
        and (
          (novo_link_tipo = 'link'
            and novo_link_valor ~* '^https?://[^[:space:]]+$'
            and char_length(novo_link_valor) <= 300)
          or (novo_link_tipo = 'whatsapp' and novo_link_valor ~ '^[0-9]{10,15}$')
        ))
  );

alter table public.sponsor_profile_changes
  drop constraint if exists sponsor_profile_changes_tem_o_que_mudar;
alter table public.sponsor_profile_changes
  add constraint sponsor_profile_changes_tem_o_que_mudar check (
    novo_display_name is not null or novo_logo_path is not null or novo_link_alterado
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Assinatura nova (3 parâmetros a mais): a antiga sai, senão o PostgREST
-- ficaria com duas versões e o GRANT da velha continuaria valendo.
drop function if exists public.request_sponsor_profile_change(text, text, text, timestamptz);

create or replace function public.request_sponsor_profile_change(
  p_display_name text,
  p_logo_path text,
  p_token_hash text,
  p_token_expira timestamptz,
  p_link_alterado boolean default false,
  p_link_tipo text default null,
  p_link_valor text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_account public.sponsor_accounts%rowtype;
  v_nome text;
  v_link_alterado boolean := coalesce(p_link_alterado, false);
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

  -- O mesmo vale para o link.
  if v_link_alterado
     and p_link_tipo is not distinct from v_account.link_tipo
     and p_link_valor is not distinct from v_account.link_valor then
    v_link_alterado := false;
  end if;

  if v_nome is null and p_logo_path is null and not v_link_alterado then
    raise exception 'Nada a alterar' using errcode = 'P0001';
  end if;

  update public.sponsor_profile_changes
  set status = 'substituida'
  where sponsor_account_id = v_account.id and status = 'pendente';

  insert into public.sponsor_profile_changes (
    sponsor_account_id, novo_display_name, novo_logo_path,
    anterior_display_name, anterior_logo_url,
    novo_link_alterado, novo_link_tipo, novo_link_valor,
    anterior_link_tipo, anterior_link_valor,
    cancel_token_hash, token_expira_em
  )
  values (
    v_account.id, v_nome, p_logo_path,
    v_account.display_name, v_account.logo_url,
    v_link_alterado,
    case when v_link_alterado then p_link_tipo end,
    case when v_link_alterado then p_link_valor end,
    v_account.link_tipo, v_account.link_valor,
    p_token_hash, p_token_expira
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

-- "Não fui eu": agora desfaz também o link, se o pedido aprovado o mexeu.
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

  if v_change.status = 'aprovada' then
    update public.sponsor_accounts
    set display_name = v_change.anterior_display_name,
        logo_url = v_change.anterior_logo_url,
        link_tipo = case when v_change.novo_link_alterado then v_change.anterior_link_tipo else link_tipo end,
        link_valor = case when v_change.novo_link_alterado then v_change.anterior_link_valor else link_valor end
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

-- Fila do staff: o retorno ganhou colunas, então a função é recriada.
drop function if exists public.list_pending_profile_changes();

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
  created_at timestamptz,
  novo_link_alterado boolean,
  novo_link_tipo text,
  novo_link_valor text,
  atual_link_tipo text,
  atual_link_valor text
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
    c.created_at,
    c.novo_link_alterado,
    c.novo_link_tipo,
    c.novo_link_valor,
    sa.link_tipo,
    sa.link_valor
  from public.sponsor_profile_changes c
  join public.sponsor_accounts sa on sa.id = c.sponsor_account_id
  where c.status = 'pendente'
    and public.is_platform_staff()
  order by c.created_at asc;
$fn$;

-- Decisão do staff. Aprovar copia para a conta — é aqui, e só aqui, que nome,
-- logo e link públicos mudam. Mesma assinatura da versão anterior.
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
        end,
        link_tipo = case when v_change.novo_link_alterado then v_change.novo_link_tipo else link_tipo end,
        link_valor = case when v_change.novo_link_alterado then v_change.novo_link_valor else link_valor end
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

-- Vitrine pública: devolve também o destino da logo. Mesmo recorte de antes
-- (ativo, não escondido, fora da carência) — só ganhou as duas colunas.
drop function if exists public.list_church_sponsors(uuid);

create or replace function public.list_church_sponsors(p_church_id uuid)
returns table (
  sponsorship_id uuid,
  display_name text,
  logo_url text,
  link_tipo text,
  link_valor text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select s.id, sa.display_name, sa.logo_url, sa.link_tipo, sa.link_valor
  from public.sponsorships s
  join public.sponsor_accounts sa on sa.id = s.sponsor_id
  where s.church_id = p_church_id
    and s.status in ('active', 'cancel_scheduled')
    and sa.deleted_at is null
    and s.hidden_at is null
    and not public.sponsor_fora_da_vitrine(s.sponsor_id)
  order by s.created_at asc, s.id asc;
$fn$;

-- ---------------------------------------------------------------------------
-- GRANTs das funções (o default do Postgres é execute para todo mundo)
-- ---------------------------------------------------------------------------
revoke all on function public.request_sponsor_profile_change(text, text, text, timestamptz, boolean, text, text) from public, anon, authenticated;
revoke all on function public.cancel_profile_change_by_token(text) from public, anon, authenticated;
revoke all on function public.list_pending_profile_changes() from public, anon, authenticated;
revoke all on function public.review_profile_change(uuid, boolean, text, text, text) from public, anon, authenticated;
revoke all on function public.list_church_sponsors(uuid) from public, anon, authenticated;

grant execute on function public.request_sponsor_profile_change(text, text, text, timestamptz, boolean, text, text) to authenticated;
-- Sem sessão: o link do email é aberto por quem está deslogado.
grant execute on function public.cancel_profile_change_by_token(text) to anon, authenticated;
grant execute on function public.list_pending_profile_changes() to authenticated;
grant execute on function public.review_profile_change(uuid, boolean, text, text, text) to authenticated;
grant execute on function public.list_church_sponsors(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
