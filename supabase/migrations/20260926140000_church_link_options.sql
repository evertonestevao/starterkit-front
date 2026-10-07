-- Link de vínculo: a igreja escolhe a validade e o número de pedidos.
--
-- Antes todo link valia 30 dias e aceitava até 20 pedidos (máximo 100). Agora
-- a validade pode ser 7, 15, 30 dias ou nenhuma (`expires_at` nulo = não
-- expira) e o número de pedidos pode ser qualquer valor de 1 a 1000 ou
-- ilimitado (`max_uses` nulo). Um link aberto continua sem ligar ninguém: cada
-- pedido precisa ser aprovado pela igreja superior, e ela pode cancelar o link
-- quando quiser.
--
-- Junto, as mensagens que a pessoa lê deixam de falar em "abaixo", "superior" e
-- "árvore" (a sede não é "mais" que as outras): falam em igreja-mãe, igrejas
-- ligadas, rede e função.

alter table public.church_link_invites alter column expires_at drop not null;
alter table public.church_link_invites alter column max_uses drop not null;
alter table public.church_link_invites alter column max_uses drop default;
alter table public.church_link_invites drop constraint if exists church_link_invites_max_uses_check;
alter table public.church_link_invites
  add constraint church_link_invites_max_uses_check check (max_uses is null or max_uses between 1 and 1000);

comment on column public.church_link_invites.expires_at is 'Nulo = o link não expira.';
comment on column public.church_link_invites.max_uses is 'Nulo = sem limite de pedidos.';

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
     or (p_expires_at is not null and p_expires_at <= now())
     or (p_max_uses is not null and (p_max_uses < 1 or p_max_uses > 1000)) then
    raise exception 'Dados do link inválidos.' using errcode = 'P0001';
  end if;

  if v_church.tipo = 'congregacao' then
    raise exception 'Uma congregação não pode ter igrejas ligadas a ela.' using errcode = 'P0001';
  end if;
  if p_tipo = 'subsede' and v_church.parent_id is not null then
    raise exception 'Só uma igreja que não tem igreja-mãe pode ter subsedes.' using errcode = 'P0001';
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
      when i.expires_at is not null and i.expires_at <= now() then 'expirado'
      when i.max_uses is not null
           and (select count(*) from public.church_link_requests r where r.invite_id = i.id) >= i.max_uses then 'esgotado'
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
  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception 'Este link expirou. Peça um novo a quem enviou.' using errcode = 'P0001';
  end if;
  if v_inv.max_uses is not null
     and (select count(*) from public.church_link_requests r where r.invite_id = v_inv.id) >= v_inv.max_uses then
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
    raise exception 'Esta igreja já faz parte de uma rede. Ela precisa desfazer o vínculo atual antes de pedir outro.'
      using errcode = 'P0001';
  end if;
  if v_parent.path <@ v_child.path then
    raise exception 'Não dá para pedir este vínculo: a igreja que enviou o link já é ligada à sua.' using errcode = 'P0001';
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
      raise exception 'Só uma igreja que não tem igreja-mãe pode ter subsedes.' using errcode = 'P0001';
    end if;
    -- Quem recebe subsedes é a sede da árvore.
    if p_parent.tipo <> 'sede' then
      update public.churches set tipo = 'sede' where id = p_parent.id;
    end if;
  elsif p_parent.tipo = 'congregacao' then
    raise exception 'Uma congregação não pode ter igrejas ligadas a ela.' using errcode = 'P0001';
  end if;
end;
$fn$;

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
    raise exception 'A igreja que pediu já faz parte de uma rede. Recuse este pedido.' using errcode = 'P0001';
  end if;
  if v_parent.path <@ v_child.path then
    raise exception 'Não dá para ligar: a sua igreja já é ligada à que pediu.' using errcode = 'P0001';
  end if;

  perform public.church_link_prepare_parent(v_parent, v_tipo);

  begin
    update public.churches set tipo = v_tipo, parent_id = v_parent.id where id = v_child.id;
  exception when check_violation then
    raise exception 'A estrutura atual de % não permite essa função: ela tem igrejas ligadas que não cabem nela.',
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
    raise exception 'Esta igreja ainda não faz parte de uma rede.' using errcode = 'P0001';
  end if;

  v_novo_pai := coalesce(p_new_parent_id, v_child.parent_id);
  select * into v_parent from public.churches where id = v_novo_pai and deleted_at is null;
  if v_parent.id is null then
    raise exception 'Igreja-mãe não encontrada.' using errcode = 'P0002';
  end if;
  if v_parent.id = v_child.id or v_parent.path <@ v_child.path then
    raise exception 'Uma igreja não pode ser ligada a si mesma nem a uma das suas próprias igrejas.' using errcode = 'P0001';
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
    raise exception 'A igreja já tem essa função.' using errcode = 'P0001';
  end if;

  perform public.church_link_prepare_parent(v_parent, p_tipo);

  v_nome_child := public.church_full_name(v_child.name, v_child.sobrenome);
  v_nome_parent := public.church_full_name(v_parent.name, v_parent.sobrenome);

  begin
    update public.churches set tipo = p_tipo, parent_id = v_parent.id where id = v_child.id;
  exception when check_violation then
    raise exception 'A estrutura atual de % não permite essa função: ela tem igrejas ligadas que não cabem nela.',
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
    raise exception 'Esta igreja não tem vínculo com uma igreja-mãe.' using errcode = 'P0001';
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
