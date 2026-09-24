-- ---------------------------------------------------------------------------
-- Vínculo entre igrejas: link da superior + pedido aprovado por ela
-- ---------------------------------------------------------------------------
-- Até aqui só a plataforma ligava uma igreja a outra (platform_set_church_
-- hierarchy). Agora o próprio pastor da igreja SUPERIOR gera um link e o manda
-- aos pastores das igrejas que ficarão abaixo dela (uma sede às subsedes, uma
-- subsede às congregações). O link é reutilizável, mas ele NÃO liga nada:
--
--   1. quem abre o link lê o que o vínculo significa e decide se quer;
--   2. querendo, gera um PEDIDO, que fica pendente;
--   3. a superior vê quem pediu, e aprova (podendo ajustar a posição) ou
--      recusa. Só então a árvore muda.
--
-- Como qualquer pessoa pode receber o link (ele é mandado a um grupo), a
-- aprovação da superior é o que impede um estranho de entrar na árvore. Quem
-- recusa o link não gera nada: nem pedido, nem aviso.
--
-- Depois de vinculada, a superior pode mudar a posição da igreja dentro da
-- árvore dela (a igreja movida é avisada), e qualquer das duas pontas pode
-- desfazer o vínculo.
--
-- `parent_id`/`tipo` continuam sem GRANT de escrita para o client: só estas
-- funções (security definer) mudam a árvore, e cada uma confere quem é o
-- usuário e a empresa dele. O token do link só é guardado como hash.

-- Um modelo anterior (link de uso único, resposta direta) chegou a existir só
-- neste ambiente de desenvolvimento. As linhas abaixo o retiram; em bancos
-- novos são no-ops.
drop function if exists public.create_church_link_invite(uuid, text, text, text, timestamptz);
drop function if exists public.get_church_link_invite(text);
drop function if exists public.respond_church_link_invite(text, uuid, boolean, text);
drop function if exists public.cancel_church_link_invite(uuid);
drop function if exists public.end_church_link(uuid);
drop function if exists public.dismiss_church_link_notice(uuid);
drop table if exists public.church_link_notices;
drop table if exists public.church_link_invites cascade;

-- ---------------------------------------------------------------------------
-- Links da superior
-- ---------------------------------------------------------------------------
create table if not exists public.church_link_invites (
  id uuid primary key default gen_random_uuid(),
  -- A igreja superior que gerou o link.
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Posição que quem entrar pelo link vai pedir. A superior pode ajustar ao aprovar.
  tipo_subordinada text not null check (tipo_subordinada in ('subsede', 'congregacao')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  -- O link vai a um grupo, mas não a um número ilimitado de pessoas.
  max_uses integer not null default 20 check (max_uses between 1 and 100),
  status text not null default 'ativo' check (status in ('ativo', 'revogado')),
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.church_link_invites is
  'Link reutilizável que a igreja superior manda aos pastores de baixo. Não liga nada: gera pedidos (church_link_requests).';

drop trigger if exists set_church_link_invites_updated_at on public.church_link_invites;
create trigger set_church_link_invites_updated_at
  before update on public.church_link_invites
  for each row
  execute function public.set_updated_at();

create index if not exists church_link_invites_church_idx
  on public.church_link_invites (church_id, created_at desc);

alter table public.church_link_invites enable row level security;
revoke all on public.church_link_invites from anon, authenticated;
-- Sem token_hash: nem o hash precisa sair do banco.
grant select (
  id, church_id, company_id, tipo_subordinada, expires_at, max_uses, status, revoked_at, created_at
) on public.church_link_invites to authenticated;

drop policy if exists "church_link_invites_select_owner" on public.church_link_invites;
create policy "church_link_invites_select_owner"
  on public.church_link_invites for select
  to authenticated
  using (public.is_company_admin(company_id));

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------
create table if not exists public.church_link_requests (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid references public.church_link_invites (id) on delete set null,
  parent_church_id uuid not null references public.churches (id) on delete cascade,
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  child_church_id uuid not null references public.churches (id) on delete cascade,
  child_company_id uuid not null references public.companies (id) on delete cascade,
  tipo_solicitado text not null check (tipo_solicitado in ('subsede', 'congregacao')),
  -- O que a superior aprovou (pode ser diferente do pedido).
  tipo_final text check (tipo_final is null or tipo_final in ('subsede', 'congregacao')),
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovado', 'recusado', 'cancelado', 'encerrado')),
  -- Retrato de quem pediu: a superior não lê perfis de outras empresas, e o
  -- nome é o que ela precisa para reconhecer o pastor.
  solicitante_nome text,
  motivo_recusa text check (motivo_recusa is null or char_length(motivo_recusa) <= 500),
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  encerrado_em timestamptz,
  encerrado_por_company_id uuid references public.companies (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.church_link_requests is
  'Pedido de vínculo gerado a partir de um link. A árvore só muda quando a superior aprova (decide_church_link_request).';

drop trigger if exists set_church_link_requests_updated_at on public.church_link_requests;
create trigger set_church_link_requests_updated_at
  before update on public.church_link_requests
  for each row
  execute function public.set_updated_at();

-- Uma igreja tem UMA superior: um pedido pendente por vez. Quem quiser pedir a
-- outra superior cancela o anterior.
create unique index if not exists church_link_requests_um_pendente
  on public.church_link_requests (child_church_id)
  where status = 'pendente';

create index if not exists church_link_requests_parent_idx
  on public.church_link_requests (parent_church_id, requested_at desc);
create index if not exists church_link_requests_child_idx
  on public.church_link_requests (child_church_id, requested_at desc);
create index if not exists church_link_requests_invite_idx
  on public.church_link_requests (invite_id);

alter table public.church_link_requests enable row level security;
revoke all on public.church_link_requests from anon, authenticated;
grant select on public.church_link_requests to authenticated;

drop policy if exists "church_link_requests_select_parties" on public.church_link_requests;
create policy "church_link_requests_select_parties"
  on public.church_link_requests for select
  to authenticated
  using (
    public.is_company_admin(parent_company_id)
    or public.is_company_admin(child_company_id)
  );

-- ---------------------------------------------------------------------------
-- Avisos (banner no início do dashboard)
-- ---------------------------------------------------------------------------
create table if not exists public.church_link_notices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  request_id uuid references public.church_link_requests (id) on delete set null,
  kind text not null check (kind in ('pedido', 'aprovado', 'recusado', 'movida', 'encerrado')),
  -- Foto do momento: o nome da OUTRA igreja, que o destinatário não lê direto.
  outra_igreja_nome text not null,
  -- Motivo da recusa, ou a nova posição numa mudança.
  detalhe text check (detalhe is null or char_length(detalhe) <= 500),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index if not exists church_link_notices_company_idx
  on public.church_link_notices (company_id, created_at desc);

alter table public.church_link_notices enable row level security;
revoke all on public.church_link_notices from anon, authenticated;
grant select on public.church_link_notices to authenticated;

drop policy if exists "church_link_notices_select_admin" on public.church_link_notices;
create policy "church_link_notices_select_admin"
  on public.church_link_notices for select
  to authenticated
  using (public.is_company_admin(company_id));

-- ---------------------------------------------------------------------------
-- Regras de posição (compartilhadas por aprovar e mover)
-- ---------------------------------------------------------------------------
-- Confere se `p_parent` pode receber uma igreja na posição `p_tipo` e, no caso
-- de uma subsede, promove a superior a sede. Devolve nada: recusa com P0001.
create or replace function public.church_link_prepare_parent(
  p_parent public.churches,
  p_tipo text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_tipo not in ('subsede', 'congregacao') then
    raise exception 'Posição inválida.' using errcode = 'P0001';
  end if;

  if p_tipo = 'subsede' then
    if p_parent.parent_id is not null then
      raise exception 'Só uma igreja que não tem superior pode ter subsedes.' using errcode = 'P0001';
    end if;
    -- Quem recebe subsedes é a sede da árvore.
    if p_parent.tipo <> 'sede' then
      update public.churches set tipo = 'sede' where id = p_parent.id;
    end if;
  elsif p_parent.tipo = 'congregacao' then
    raise exception 'Uma congregação não pode ter igrejas abaixo dela.' using errcode = 'P0001';
  end if;
end;
$fn$;

revoke all on function public.church_link_prepare_parent(public.churches, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

-- A superior gera o link. O token chega já em hash: o texto puro vive só no link.
create or replace function public.create_church_link_invite(
  p_church_id uuid,
  p_tipo text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_max_uses integer default 20
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_church public.churches%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;

  select * into v_church from public.churches where id = p_church_id and deleted_at is null;
  if v_church.id is null then
    raise exception 'Igreja não encontrada.' using errcode = 'P0002';
  end if;
  if not public.is_company_admin(v_church.company_id) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  if p_tipo not in ('subsede', 'congregacao')
     or coalesce(length(p_token_hash), 0) < 32
     or p_expires_at is null or p_expires_at <= now()
     or p_max_uses is null or p_max_uses < 1 or p_max_uses > 100 then
    raise exception 'Dados do link inválidos.' using errcode = 'P0001';
  end if;

  if v_church.tipo = 'congregacao' then
    raise exception 'Uma congregação não pode ter igrejas abaixo dela.' using errcode = 'P0001';
  end if;
  if p_tipo = 'subsede' and v_church.parent_id is not null then
    raise exception 'Só uma igreja que não tem superior pode ter subsedes.' using errcode = 'P0001';
  end if;

  insert into public.church_link_invites (
    church_id, company_id, tipo_subordinada, token_hash, expires_at, max_uses, created_by
  )
  values (p_church_id, v_church.company_id, p_tipo, p_token_hash, p_expires_at, p_max_uses, auth.uid())
  returning id into v_id;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_church.company_id, auth.uid(), 'church.link.invited', 'church', p_church_id,
          jsonb_build_object('tipo_subordinada', p_tipo, 'invite_id', v_id, 'max_uses', p_max_uses));

  return v_id;
end;
$fn$;

-- A superior desiste do link: quem ainda não usou não consegue mais.
create or replace function public.revoke_church_link_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_inv public.church_link_invites%rowtype;
begin
  select * into v_inv from public.church_link_invites where id = p_invite_id for update;
  if v_inv.id is null then
    return false;
  end if;
  if not public.is_company_admin(v_inv.company_id) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if v_inv.status <> 'ativo' then
    return false;
  end if;

  update public.church_link_invites set status = 'revogado', revoked_at = now() where id = v_inv.id;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_inv.company_id, auth.uid(), 'church.link.revoked', 'church', v_inv.church_id,
          jsonb_build_object('invite_id', v_inv.id));
  return true;
end;
$fn$;

-- O que a pessoa vê ao abrir o link. Só com sessão: assim nenhum visitante
-- anônimo descobre nada por tentativa.
create or replace function public.get_church_link_invite(p_token_hash text)
returns table (
  invite_id uuid,
  tipo_subordinada text,
  status text,
  expires_at timestamptz,
  is_mine boolean,
  church_id uuid,
  church_name text,
  church_sobrenome text,
  church_address text,
  church_tipo text,
  church_public_code text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;

  return query
  select
    i.id,
    i.tipo_subordinada,
    case
      when i.status = 'revogado' then 'revogado'
      when i.expires_at <= now() then 'expirado'
      when (select count(*) from public.church_link_requests r where r.invite_id = i.id) >= i.max_uses then 'esgotado'
      else 'ativo'
    end,
    i.expires_at,
    public.is_company_admin(i.company_id),
    c.id,
    c.name,
    c.sobrenome,
    c.address,
    c.tipo,
    c.public_code
  from public.church_link_invites i
  join public.churches c on c.id = i.church_id
  where i.token_hash = p_token_hash
    and c.deleted_at is null;
end;
$fn$;

-- A igreja de baixo pede o vínculo. Não muda a árvore: gera um pedido pendente
-- e avisa a superior.
create or replace function public.request_church_link(p_token_hash text, p_child_church_id uuid)
returns table (
  parent_company_id uuid,
  parent_church_name text,
  child_church_name text,
  tipo_solicitado text
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_inv public.church_link_invites%rowtype;
  v_parent public.churches%rowtype;
  v_child public.churches%rowtype;
  v_solicitante text;
  v_id uuid;
  v_nome_parent text;
  v_nome_child text;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;

  select * into v_inv from public.church_link_invites where token_hash = p_token_hash for update;
  if v_inv.id is null then
    raise exception 'Este link não existe ou foi apagado.' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'ativo' then
    raise exception 'Este link foi cancelado por quem o enviou. Peça um novo.' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'Este link expirou. Peça um novo a quem enviou.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.church_link_requests r where r.invite_id = v_inv.id) >= v_inv.max_uses then
    raise exception 'Este link já foi usado o máximo de vezes. Peça um novo a quem enviou.' using errcode = 'P0001';
  end if;

  select * into v_child from public.churches where id = p_child_church_id and deleted_at is null;
  if v_child.id is null then
    raise exception 'Igreja não encontrada.' using errcode = 'P0002';
  end if;
  if not public.is_company_admin(v_child.company_id) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  select * into v_parent from public.churches where id = v_inv.church_id and deleted_at is null;
  if v_parent.id is null then
    raise exception 'A igreja que enviou este link não existe mais.' using errcode = 'P0001';
  end if;
  if v_parent.id = v_child.id then
    raise exception 'Uma igreja não pode se vincular a ela mesma.' using errcode = 'P0001';
  end if;
  if v_child.parent_id is not null then
    raise exception 'Esta igreja já faz parte de uma árvore. Ela precisa desfazer o vínculo atual antes de pedir outro.'
      using errcode = 'P0001';
  end if;
  if v_parent.path <@ v_child.path then
    raise exception 'Não dá para pedir este vínculo: a igreja que enviou o link já está abaixo da sua.' using errcode = 'P0001';
  end if;

  select full_name into v_solicitante from public.profiles where id = auth.uid();

  begin
    insert into public.church_link_requests (
      invite_id, parent_church_id, parent_company_id, child_church_id, child_company_id,
      tipo_solicitado, solicitante_nome, requested_by
    )
    values (v_inv.id, v_parent.id, v_parent.company_id, v_child.id, v_child.company_id,
            v_inv.tipo_subordinada, v_solicitante, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esta igreja já tem um pedido de vínculo aguardando resposta. Cancele-o antes de fazer outro.'
      using errcode = 'P0001';
  end;

  v_nome_parent := public.church_full_name(v_parent.name, v_parent.sobrenome);
  v_nome_child := public.church_full_name(v_child.name, v_child.sobrenome);

  if v_parent.company_id <> v_child.company_id then
    insert into public.church_link_notices (company_id, request_id, kind, outra_igreja_nome)
    values (v_parent.company_id, v_id, 'pedido', v_nome_child);
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_child.company_id, auth.uid(), 'church.link.requested', 'church', v_child.id,
          jsonb_build_object('request_id', v_id, 'parent_id', v_parent.id, 'tipo', v_inv.tipo_subordinada));

  return query select v_parent.company_id, v_nome_parent, v_nome_child, v_inv.tipo_subordinada;
end;
$fn$;

-- A igreja de baixo desiste do pedido pendente.
create or replace function public.cancel_church_link_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_req public.church_link_requests%rowtype;
begin
  select * into v_req from public.church_link_requests where id = p_request_id for update;
  if v_req.id is null then
    return false;
  end if;
  if not public.is_company_admin(v_req.child_company_id) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if v_req.status <> 'pendente' then
    return false;
  end if;

  update public.church_link_requests set status = 'cancelado', decided_at = now(), decided_by = auth.uid()
  where id = v_req.id;
  return true;
end;
$fn$;

-- A superior decide. Aprovar é o ÚNICO caminho que liga uma igreja a outra por
-- pedido; ela pode ajustar a posição (`p_tipo`) em relação ao que foi pedido.
create or replace function public.decide_church_link_request(
  p_request_id uuid,
  p_aprovar boolean,
  p_tipo text default null,
  p_motivo text default null
)
returns table (
  child_company_id uuid,
  parent_church_name text,
  child_church_name text,
  tipo text,
  aprovado boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_req public.church_link_requests%rowtype;
  v_parent public.churches%rowtype;
  v_child public.churches%rowtype;
  v_tipo text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_nome_parent text;
  v_nome_child text;
begin
  select * into v_req from public.church_link_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  if not public.is_company_admin(v_req.parent_company_id) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if v_req.status <> 'pendente' then
    raise exception 'Este pedido já foi respondido ou cancelado.' using errcode = 'P0001';
  end if;

  select * into v_parent from public.churches where id = v_req.parent_church_id and deleted_at is null;
  select * into v_child from public.churches where id = v_req.child_church_id and deleted_at is null;
  if v_parent.id is null or v_child.id is null then
    raise exception 'Uma das igrejas deste pedido não existe mais.' using errcode = 'P0001';
  end if;

  v_nome_parent := public.church_full_name(v_parent.name, v_parent.sobrenome);
  v_nome_child := public.church_full_name(v_child.name, v_child.sobrenome);
  v_tipo := coalesce(p_tipo, v_req.tipo_solicitado);

  -- ----------------------------- recusa ------------------------------------
  if not p_aprovar then
    update public.church_link_requests
    set status = 'recusado', decided_by = auth.uid(), decided_at = now(),
        motivo_recusa = case when v_motivo is null then null else left(v_motivo, 500) end
    where id = v_req.id;

    if v_parent.company_id <> v_child.company_id then
      insert into public.church_link_notices (company_id, request_id, kind, outra_igreja_nome, detalhe)
      values (v_child.company_id, v_req.id, 'recusado', v_nome_parent,
              case when v_motivo is null then null else left(v_motivo, 500) end);
    end if;

    insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
    values (v_parent.company_id, auth.uid(), 'church.link.refused', 'church', v_parent.id,
            jsonb_build_object('request_id', v_req.id, 'child_id', v_child.id));

    return query select v_child.company_id, v_nome_parent, v_nome_child, v_tipo, false;
    return;
  end if;

  -- ----------------------------- aprovação ---------------------------------
  if v_child.parent_id is not null then
    raise exception 'A igreja que pediu já faz parte de uma árvore. Recuse este pedido.' using errcode = 'P0001';
  end if;
  if v_parent.path <@ v_child.path then
    raise exception 'Não dá para ligar: a sua igreja já está abaixo da que pediu.' using errcode = 'P0001';
  end if;

  perform public.church_link_prepare_parent(v_parent, v_tipo);

  begin
    update public.churches set tipo = v_tipo, parent_id = v_parent.id where id = v_child.id;
  exception when check_violation then
    raise exception 'A estrutura atual de % não permite essa posição: ela tem igrejas abaixo que não cabem nela.',
      v_nome_child using errcode = 'P0001';
  end;

  update public.church_link_requests
  set status = 'aprovado', tipo_final = v_tipo, decided_by = auth.uid(), decided_at = now()
  where id = v_req.id;

  -- Uma igreja tem uma superior só: pedidos a outras ficam sem efeito.
  update public.church_link_requests
  set status = 'cancelado', decided_at = now()
  where child_church_id = v_child.id and status = 'pendente' and id <> v_req.id;

  if v_parent.company_id <> v_child.company_id then
    insert into public.church_link_notices (company_id, request_id, kind, outra_igreja_nome, detalhe)
    values (v_child.company_id, v_req.id, 'aprovado', v_nome_parent, v_tipo);
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_parent.company_id, auth.uid(), 'church.link.approved', 'church', v_parent.id,
          jsonb_build_object('request_id', v_req.id, 'child_id', v_child.id, 'tipo', v_tipo));
  if v_parent.company_id <> v_child.company_id then
    insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
    values (v_child.company_id, auth.uid(), 'church.link.approved', 'church', v_child.id,
            jsonb_build_object('request_id', v_req.id, 'parent_id', v_parent.id, 'tipo', v_tipo));
  end if;

  return query select v_child.company_id, v_nome_parent, v_nome_child, v_tipo, true;
end;
$fn$;

-- A superior muda a posição de uma igreja que já está na árvore dela: o tipo
-- (subsede/congregação) e/ou a igreja acima (por exemplo, uma congregação que
-- estava direto sob a sede passa a ficar sob uma subsede). Só dentro da árvore
-- que ela administra; a igreja movida é avisada.
create or replace function public.change_church_position(
  p_child_id uuid,
  p_tipo text,
  p_new_parent_id uuid default null
)
returns table (
  child_company_id uuid,
  child_church_name text,
  parent_church_name text,
  tipo text
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_child public.churches%rowtype;
  v_parent public.churches%rowtype;
  v_novo_pai uuid;
  v_nome_child text;
  v_nome_parent text;
  v_avisar boolean;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;

  select * into v_child from public.churches where id = p_child_id and deleted_at is null;
  if v_child.id is null then
    raise exception 'Igreja não encontrada.' using errcode = 'P0002';
  end if;
  if v_child.parent_id is null then
    raise exception 'Esta igreja ainda não faz parte de uma árvore.' using errcode = 'P0001';
  end if;

  v_novo_pai := coalesce(p_new_parent_id, v_child.parent_id);
  select * into v_parent from public.churches where id = v_novo_pai and deleted_at is null;
  if v_parent.id is null then
    raise exception 'Igreja superior não encontrada.' using errcode = 'P0002';
  end if;
  if v_parent.id = v_child.id or v_parent.path <@ v_child.path then
    raise exception 'Uma igreja não pode ficar abaixo de si mesma nem de uma das suas igrejas.' using errcode = 'P0001';
  end if;

  -- Quem muda administra uma igreja ACIMA desta, e o destino fica dentro dessa
  -- mesma árvore: ninguém tira uma igreja da árvore dos outros.
  if not exists (
    select 1
    from public.churches a
    where a.deleted_at is null
      and a.path @> v_child.path and a.id <> v_child.id
      and v_parent.path <@ a.path
      and public.is_company_admin(a.company_id)
  ) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  if v_novo_pai = v_child.parent_id and p_tipo = v_child.tipo then
    raise exception 'A igreja já está nessa posição.' using errcode = 'P0001';
  end if;

  perform public.church_link_prepare_parent(v_parent, p_tipo);

  v_nome_child := public.church_full_name(v_child.name, v_child.sobrenome);
  v_nome_parent := public.church_full_name(v_parent.name, v_parent.sobrenome);

  begin
    update public.churches set tipo = p_tipo, parent_id = v_parent.id where id = v_child.id;
  exception when check_violation then
    raise exception 'A estrutura atual de % não permite essa posição: ela tem igrejas abaixo que não cabem nela.',
      v_nome_child using errcode = 'P0001';
  end;

  -- Quem foi movida precisa saber (ela passa a ser vista por outro pastor),
  -- a menos que a mesma equipe administre os dois lados.
  v_avisar := not public.is_company_admin(v_child.company_id);
  if v_avisar then
    insert into public.church_link_notices (company_id, kind, outra_igreja_nome, detalhe)
    values (v_child.company_id, 'movida', v_nome_parent,
            case p_tipo when 'subsede' then 'Agora é subsede' else 'Agora é congregação' end);
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_child.company_id, auth.uid(), 'church.link.moved', 'church', v_child.id,
          jsonb_build_object('parent_anterior', v_child.parent_id, 'parent_novo', v_parent.id,
                             'tipo_anterior', v_child.tipo, 'tipo_novo', p_tipo));

  return query select case when v_avisar then v_child.company_id else null::uuid end,
                      v_nome_child, v_nome_parent, p_tipo;
end;
$fn$;

-- Desfaz o vínculo de uma igreja com a superior dela. Vale para os dois lados:
-- a de baixo sai, ou a de cima a solta. A igreja volta a ser independente (e,
-- sem superior, volta ao nome próprio: o trigger cuida disso).
create or replace function public.end_church_link(p_church_id uuid)
returns table (
  other_company_id uuid,
  other_church_name text,
  own_church_name text
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_child public.churches%rowtype;
  v_parent public.churches%rowtype;
  v_child_side boolean;
  v_parent_side boolean;
  v_nome_child text;
  v_nome_parent text;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;

  select * into v_child from public.churches where id = p_church_id and deleted_at is null;
  if v_child.id is null then
    raise exception 'Igreja não encontrada.' using errcode = 'P0002';
  end if;
  if v_child.parent_id is null then
    raise exception 'Esta igreja não tem vínculo com uma igreja superior.' using errcode = 'P0001';
  end if;
  select * into v_parent from public.churches where id = v_child.parent_id;

  v_child_side := public.is_company_admin(v_child.company_id);
  v_parent_side := public.is_company_admin(v_parent.company_id);
  if not v_child_side and not v_parent_side then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  v_nome_child := public.church_full_name(v_child.name, v_child.sobrenome);
  v_nome_parent := public.church_full_name(v_parent.name, v_parent.sobrenome);

  -- Congregação precisa de uma igreja acima; sem ela, volta a ser independente
  -- (o tipo que uma igreja nova recebe).
  update public.churches
  set parent_id = null,
      tipo = case when tipo = 'congregacao' then 'subsede' else tipo end
  where id = v_child.id;

  update public.church_link_requests
  set status = 'encerrado', encerrado_em = now(),
      encerrado_por_company_id = case when v_child_side then v_child.company_id else v_parent.company_id end
  where status = 'aprovado' and child_church_id = v_child.id;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (case when v_child_side then v_child.company_id else v_parent.company_id end,
          auth.uid(), 'church.link.ended', 'church', v_child.id,
          jsonb_build_object('parent_id', v_parent.id, 'child_id', v_child.id));

  if v_child_side and v_parent_side then
    -- Mesma empresa nos dois lados: ninguém para avisar.
    return query select null::uuid, v_nome_parent, v_nome_child;
    return;
  end if;

  if v_child_side then
    insert into public.church_link_notices (company_id, kind, outra_igreja_nome)
    values (v_parent.company_id, 'encerrado', v_nome_child);
    insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
    values (v_parent.company_id, auth.uid(), 'church.link.ended', 'church', v_parent.id,
            jsonb_build_object('parent_id', v_parent.id, 'child_id', v_child.id));
    return query select v_parent.company_id, v_nome_parent, v_nome_child;
  else
    insert into public.church_link_notices (company_id, kind, outra_igreja_nome)
    values (v_child.company_id, 'encerrado', v_nome_parent);
    insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
    values (v_child.company_id, auth.uid(), 'church.link.ended', 'church', v_child.id,
            jsonb_build_object('parent_id', v_parent.id, 'child_id', v_child.id));
    return query select v_child.company_id, v_nome_child, v_nome_parent;
  end if;
end;
$fn$;

-- "Entendi": esconde o aviso do banner.
create or replace function public.dismiss_church_link_notice(p_notice_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company uuid;
begin
  select company_id into v_company from public.church_link_notices where id = p_notice_id;
  if v_company is null then
    return false;
  end if;
  if not public.is_company_admin(v_company) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  update public.church_link_notices set seen_at = now() where id = p_notice_id and seen_at is null;
  return true;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- GRANTs das funções (o default do Postgres é execute para todo mundo)
-- ---------------------------------------------------------------------------
revoke all on function public.create_church_link_invite(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.revoke_church_link_invite(uuid) from public, anon, authenticated;
revoke all on function public.get_church_link_invite(text) from public, anon, authenticated;
revoke all on function public.request_church_link(text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_church_link_request(uuid) from public, anon, authenticated;
revoke all on function public.decide_church_link_request(uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.change_church_position(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.end_church_link(uuid) from public, anon, authenticated;
revoke all on function public.dismiss_church_link_notice(uuid) from public, anon, authenticated;

grant execute on function public.create_church_link_invite(uuid, text, text, timestamptz, integer) to authenticated;
grant execute on function public.revoke_church_link_invite(uuid) to authenticated;
grant execute on function public.get_church_link_invite(text) to authenticated;
grant execute on function public.request_church_link(text, uuid) to authenticated;
grant execute on function public.cancel_church_link_request(uuid) to authenticated;
grant execute on function public.decide_church_link_request(uuid, boolean, text, text) to authenticated;
grant execute on function public.change_church_position(uuid, text, uuid) to authenticated;
grant execute on function public.end_church_link(uuid) to authenticated;
grant execute on function public.dismiss_church_link_notice(uuid) to authenticated;

notify pgrst, 'reload schema';
