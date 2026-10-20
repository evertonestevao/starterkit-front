-- ---------------------------------------------------------------------------
-- Hierarquia Sede -> Subsede -> Congregação
-- ---------------------------------------------------------------------------
-- A árvore já existia pela metade desde o core: `churches.parent_id` e
-- `churches.path` (ltree). Faltavam três coisas, e esta migration fecha as três:
--
-- 1. O TIPO do nó. Sem ele, "subsede" e "congregação" eram só profundidade, e
--    uma congregação podia virar mãe de outra sem ninguém notar.
--
-- 2. O CAMINHO DOS DESCENDENTES. `sync_church_path` recalculava o path só da
--    linha alterada. Ligar uma subsede a uma sede atualizava a subsede e
--    deixava as congregações dela com o path antigo — a sede nunca as veria,
--    porque o acesso é decidido por `path <@`. Agora a mudança cascateia.
--
-- 3. O ACESSO PELA ÁRVORE. Até aqui toda policy de dado de igreja perguntava
--    "você é da empresa dona desta linha?". Passa a perguntar "você é de
--    alguma igreja ACIMA ou IGUAL a esta na árvore?". Sede vê tudo o que está
--    abaixo dela; subsede vê as suas congregações; congregação vê só a si.
--
-- O QUE NÃO MUDA: escrita. Criar evento, programação, esconder patrocinador
-- etc. segue restrito ao admin da PRÓPRIA empresa. A árvore dá leitura para
-- cima, não controle — a sede não edita a agenda da congregação.
--
-- VÍNCULO USUÁRIO -> NÓ: continua passando pela empresa. Cada empresa é dona
-- da sua igreja (create_company_with_church), e o papel (owner/admin/member)
-- vive em company_members. "Papel atrelado a um nó" = papel na empresa dona
-- daquele nó. Não foi criada uma tabela paralela de membros por igreja.
--
-- LIGAR DEPOIS: ligar uma subsede a uma sede é só preencher `parent_id`
-- (pela RPC da plataforma abaixo). O trigger reescreve os paths da subárvore e
-- as policies passam a valer na hora. Nenhum dado de negócio é migrado.

-- ---------------------------------------------------------------------------
-- 1. Tipo do nó
-- ---------------------------------------------------------------------------
-- Default 'subsede': é o que o onboarding cria hoje (uma igreja sem pai). A
-- sede do piloto ainda não está no sistema; quando entrar, ganha o tipo pela
-- RPC da plataforma.
alter table public.churches
  add column if not exists tipo text not null default 'subsede'
    check (tipo in ('sede', 'subsede', 'congregacao'));

comment on column public.churches.tipo is
  'Nível na árvore: sede > subsede > congregacao. Só a plataforma altera.';

-- Backfill pelo formato atual da árvore, de cima para baixo.
--   raiz com netos         -> sede
--   raiz sem netos         -> subsede (subsede solta, sede ligada depois)
--   filho de sede          -> subsede
--   filho de subsede       -> congregacao
do $$
declare
  v_row record;
  v_tipo text;
  v_tipo_pai text;
begin
  if exists (select 1 from public.churches where nlevel(path) > 3) then
    raise exception 'arvore de igrejas com mais de 3 niveis: classifique manualmente antes desta migration';
  end if;

  for v_row in
    select id, parent_id, path from public.churches order by nlevel(path), created_at
  loop
    if v_row.parent_id is null then
      if exists (
        select 1 from public.churches d
        where d.path <@ v_row.path and nlevel(d.path) >= nlevel(v_row.path) + 2
      ) then
        v_tipo := 'sede';
      else
        v_tipo := 'subsede';
      end if;
    else
      select tipo into v_tipo_pai from public.churches where id = v_row.parent_id;
      v_tipo := case when v_tipo_pai = 'sede' then 'subsede' else 'congregacao' end;
    end if;

    update public.churches set tipo = v_tipo where id = v_row.id;
  end loop;
end $$;

-- Consulta por subárvore (`path <@`) precisa do índice GiST.
create index if not exists churches_path_gist_idx on public.churches using gist (path);
create index if not exists churches_parent_idx on public.churches (parent_id);

-- ---------------------------------------------------------------------------
-- 2. Regras da árvore + path que cascateia
-- ---------------------------------------------------------------------------
-- Quem pode ser pai de quem. Congregação é folha.
create or replace function public.church_tipo_aceita_pai(p_tipo text, p_tipo_pai text)
returns boolean
language sql
immutable
as $$
  -- coalesce: `null in (...)` é NULL, e `not NULL` não barra nada no trigger.
  select coalesce(
    case p_tipo
      when 'sede' then p_tipo_pai is null
      when 'subsede' then p_tipo_pai is null or p_tipo_pai = 'sede'
      when 'congregacao' then p_tipo_pai in ('sede', 'subsede')
      else false
    end,
    false
  );
$$;

-- Substitui a versão do core: mesmo cálculo de path, mais a validação de tipo
-- e a trava contra ciclo (uma igreja não pode ficar abaixo de si mesma).
create or replace function public.sync_church_path()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent public.churches%rowtype;
begin
  if new.parent_id is null then
    if not public.church_tipo_aceita_pai(new.tipo, null) then
      raise exception 'uma igreja do tipo % precisa de uma igreja acima dela', new.tipo
        using errcode = 'check_violation';
    end if;
    new.path = new.slug::ltree;
    return new;
  end if;

  select * into v_parent from public.churches where id = new.parent_id;
  if v_parent.id is null then
    raise exception 'igreja superior nao encontrada' using errcode = 'foreign_key_violation';
  end if;

  if tg_op = 'UPDATE' and v_parent.path <@ old.path then
    raise exception 'uma igreja nao pode ficar abaixo de si mesma' using errcode = 'check_violation';
  end if;

  if not public.church_tipo_aceita_pai(new.tipo, v_parent.tipo) then
    raise exception 'uma igreja do tipo % nao pode ficar abaixo de uma do tipo %', new.tipo, v_parent.tipo
      using errcode = 'check_violation';
  end if;

  new.path = (v_parent.path::text || '.' || new.slug)::ltree;
  return new;
end;
$$;

-- O trigger do core só olhava parent_id e slug. Mudar o TIPO também precisa
-- passar pela validação.
drop trigger if exists sync_church_path_before_write on public.churches;
create trigger sync_church_path_before_write
  before insert or update of parent_id, slug, tipo
  on public.churches
  for each row
  execute function public.sync_church_path();

-- Trocar o tipo de um nó que já tem filhos não pode deixar filho inválido
-- (ex.: subsede com congregações virando congregação).
create or replace function public.check_church_children_tipo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.churches f
    where f.parent_id = new.id
      and not public.church_tipo_aceita_pai(f.tipo, new.tipo)
  ) then
    raise exception 'as igrejas abaixo desta nao podem ficar abaixo de uma do tipo %', new.tipo
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists check_church_children_tipo_after_update on public.churches;
create trigger check_church_children_tipo_after_update
  after update of tipo on public.churches
  for each row
  when (old.tipo is distinct from new.tipo)
  execute function public.check_church_children_tipo();

-- Reescreve o path da subárvore quando o do nó muda. SECURITY DEFINER: a
-- mudança de pai é da plataforma, e a RLS de quem disparou não pode deixar
-- metade da subárvore com path velho (seria acesso decidido por dado torto).
-- Atualizar só `path` não redispara sync_church_path (o trigger olha
-- parent_id/slug/tipo), então não há recursão.
create or replace function public.cascade_church_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.churches
  set path = new.path || subpath(path, nlevel(old.path))
  where path <@ old.path
    and id <> new.id;
  return null;
end;
$$;

revoke all on function public.cascade_church_path() from public, anon, authenticated;

drop trigger if exists cascade_church_path_after_update on public.churches;
create trigger cascade_church_path_after_update
  after update of parent_id, slug on public.churches
  for each row
  when (old.path is distinct from new.path)
  execute function public.cascade_church_path();

-- ---------------------------------------------------------------------------
-- 3. Acesso pela árvore
-- ---------------------------------------------------------------------------
-- "Posso ver os dados desta igreja?" = sou membro ativo de uma empresa dona de
-- uma igreja (viva) que é esta ou está acima dela. security definer pelo mesmo
-- motivo de is_company_member: evita recursão de RLS.
create or replace function public.can_view_church(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.churches alvo
    join public.churches minha on alvo.path <@ minha.path
    join public.company_members cm on cm.company_id = minha.company_id
    where alvo.id = p_church_id
      and minha.deleted_at is null
      and minha.company_id is not null
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
  );
$$;

-- Mesma regra, exigindo owner/admin. Usada onde a leitura é de gestão
-- (patrocínios), que o member da própria igreja também não vê.
create or replace function public.can_admin_view_church(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.churches alvo
    join public.churches minha on alvo.path <@ minha.path
    join public.company_members cm on cm.company_id = minha.company_id
    where alvo.id = p_church_id
      and minha.deleted_at is null
      and minha.company_id is not null
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
      and cm.role in ('owner', 'admin')
  );
$$;

revoke all on function public.can_view_church(uuid) from public, anon, authenticated;
revoke all on function public.can_admin_view_church(uuid) from public, anon, authenticated;
revoke all on function public.church_tipo_aceita_pai(text, text) from public, anon, authenticated;
grant execute on function public.can_view_church(uuid) to authenticated;
grant execute on function public.can_admin_view_church(uuid) to authenticated;

-- Caixa de entrada da comunidade: membro da igreja ou de uma acima dela.
-- `can_view_church` já cobre a própria empresa (alvo = minha), então a regra
-- antiga está contida na nova.
drop policy if exists "prayer_requests_select_company" on public.prayer_requests;
create policy "prayer_requests_select_tree"
  on public.prayer_requests for select
  to authenticated
  using (public.can_view_church(church_id));

drop policy if exists "event_signups_select_company" on public.event_signups;
create policy "event_signups_select_tree"
  on public.event_signups for select
  to authenticated
  using (public.can_view_church(church_id));

drop policy if exists "visitors_select_company" on public.visitors;
create policy "visitors_select_tree"
  on public.visitors for select
  to authenticated
  using (public.can_view_church(church_id));

-- Patrocínios: admin da igreja ou de uma acima dela. Sem dado pessoal do
-- patrocinador aqui (isso fica em sponsor_accounts, que a igreja não lê).
drop policy if exists "sponsorships_select_church_admin" on public.sponsorships;
create policy "sponsorships_select_church_tree_admin"
  on public.sponsorships for select
  to authenticated
  using (public.can_admin_view_church(church_id));

-- church_events e church_schedule: leitura já é pública; escrita segue da
-- própria empresa (policies existentes, sem mudança).

-- ---------------------------------------------------------------------------
-- 4. Estrutura da árvore só pela plataforma
-- ---------------------------------------------------------------------------
-- parent_id e tipo nunca estiveram no GRANT de UPDATE do client; seguem fora.
-- O INSERT, porém, estava liberado na tabela INTEIRA para authenticated — um
-- admin podia criar uma igreja já com parent_id de outra árvore, com
-- `dominio_status = 'ativo'` sem provar DNS, ou com `tipo = 'sede'`. Nenhum
-- código insere em churches pelo client: igreja só nasce pela RPC do
-- onboarding (create_company_with_church). O INSERT sai.
revoke insert on public.churches from authenticated;
drop policy if exists "churches_insert_company_admin" on public.churches;

-- Liga/desliga um nó e define o tipo. Só staff da plataforma, com trilha.
create or replace function public.platform_set_church_hierarchy(
  p_church_id uuid,
  p_tipo text,
  p_parent_id uuid
)
returns public.churches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes public.churches;
  v_depois public.churches;
begin
  if not public.is_platform_staff() then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  select * into v_antes from public.churches where id = p_church_id and deleted_at is null;
  if v_antes.id is null then
    raise exception 'igreja nao encontrada' using errcode = 'no_data_found';
  end if;

  if p_parent_id is not null and not exists (
    select 1 from public.churches where id = p_parent_id and deleted_at is null
  ) then
    raise exception 'igreja superior nao encontrada' using errcode = 'no_data_found';
  end if;

  -- Validação de tipo, ciclo e path: triggers de churches.
  update public.churches
  set tipo = p_tipo,
      parent_id = p_parent_id
  where id = p_church_id
  returning * into v_depois;

  insert into public.platform_staff_actions (staff_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'church.hierarchy.set',
    'church',
    p_church_id,
    jsonb_build_object(
      'tipo_antes', v_antes.tipo,
      'tipo_depois', v_depois.tipo,
      'parent_antes', v_antes.parent_id,
      'parent_depois', v_depois.parent_id
    )
  );

  return v_depois;
end;
$$;

-- Lista para a tela da plataforma: estrutura, não dados de negócio.
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
  select c.id, c.name, c.public_code, c.tipo, c.parent_id, c.path::text, c.company_id, c.created_at
  from public.churches c
  where c.deleted_at is null
  order by c.path;
end;
$$;

revoke all on function public.platform_set_church_hierarchy(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.platform_list_churches() from public, anon, authenticated;
grant execute on function public.platform_set_church_hierarchy(uuid, text, uuid) to authenticated;
grant execute on function public.platform_list_churches() to authenticated;

notify pgrst, 'reload schema';
