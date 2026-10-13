-- EBD → Revistas na rede: a subsede (ou a sede) compra as revistas dela e das
-- congregações ligadas diretamente a ela, numa compra só.
--
--   * A lista de revistas e o trimestre são da igreja de cima ("dona da
--     lista"): a congregação ligada usa os dela, com o mesmo preço, e só
--     registra os pedidos dos próprios alunos (pagamento e entrega, como antes).
--   * A dona da lista vê a aba Rede: o total de cada revista somando ela e as
--     congregações, e quanto cada igreja pediu. SÓ NÚMEROS — nomes, pagamentos
--     e quem deve continuam com cada congregação (LGPD).
--   * Congregação que não usa o sistema: a dona registra um "pedido de
--     congregação" só com as quantidades de cada revista.
--   * A sede junta só as congregações ligadas direto a ela; subsede faz a
--     compra dela. Congregação sem igreja de cima continua com a lista própria.

-- ---------------------------------------------------------------------------
-- 1. Quem define a lista de uma igreja
-- ---------------------------------------------------------------------------
create or replace function public.ebd_revistas_dona(p_church_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when c.tipo = 'congregacao' and acima.id is not null then acima.id
    else c.id
  end
  from public.churches c
  left join public.churches acima on acima.id = c.parent_id and acima.deleted_at is null
  where c.id = p_church_id and c.deleted_at is null;
$$;

-- A igreja dos pedidos, se quem pede é da gestão da EBD dela e o trimestre é
-- da dona da lista dela; senão, null. Sem p_church_id: a igreja do trimestre
-- (como antes, para a igreja que define a própria lista).
create or replace function public.ebd_revistas_contexto(p_trimestre_id uuid, p_church_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select i.id
  from public.ebd_trimestres t
  cross join lateral (select coalesce(p_church_id, t.church_id) as id) i
  where t.id = p_trimestre_id and t.deleted_at is null
    and public.can_gerir_ebd(i.id)
    and public.ebd_revistas_dona(i.id) = t.church_id;
$$;

-- Para a tela: de quem é a lista e os trimestres dela.
create or replace function public.ebd_revistas_lista_da_igreja(p_church_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with dona as (select public.ebd_revistas_dona(p_church_id) as id)
  select jsonb_build_object(
    'dona_id', d.id,
    'dona_nome', concat_ws(' · ', d.name, nullif(btrim(coalesce(d.sobrenome, '')), '')),
    'propria', d.id = p_church_id,
    -- A dona tem congregações ligadas direto a ela? (mostra a aba Rede)
    'tem_congregacoes', exists (
      select 1 from public.churches f
      where f.parent_id = d.id and f.tipo = 'congregacao' and f.deleted_at is null
    ),
    'trimestres', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'nome', t.nome, 'inicio', t.inicio, 'fim', t.fim
      ) order by t.inicio desc), '[]'::jsonb)
      from public.ebd_trimestres t where t.church_id = d.id and t.deleted_at is null
    )
  )
  from dona join public.churches d on d.id = dona.id
  where public.can_gerir_ebd(p_church_id);
$$;

-- ---------------------------------------------------------------------------
-- 2. Pedidos de congregação fora do sistema (só quantidades)
-- ---------------------------------------------------------------------------
create table if not exists public.ebd_revista_pedidos_externos (
  id uuid primary key default gen_random_uuid(),
  -- A dona da lista, que registra o pedido.
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  trimestre_id uuid not null references public.ebd_trimestres (id) on delete cascade,
  nome_congregacao text not null check (char_length(nome_congregacao) between 2 and 120),
  -- [{"revista_id": uuid, "quantidade": int}], conferido na função.
  itens jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ebd_revista_pedidos_externos_trimestre_idx
  on public.ebd_revista_pedidos_externos (trimestre_id) where deleted_at is null;

drop trigger if exists set_ebd_revista_pedidos_externos_company_id on public.ebd_revista_pedidos_externos;
create trigger set_ebd_revista_pedidos_externos_company_id
  before insert or update of church_id on public.ebd_revista_pedidos_externos
  for each row execute function public.set_company_id_from_church();
drop trigger if exists set_ebd_revista_pedidos_externos_updated_at on public.ebd_revista_pedidos_externos;
create trigger set_ebd_revista_pedidos_externos_updated_at before update on public.ebd_revista_pedidos_externos
  for each row execute function public.set_updated_at();

alter table public.ebd_revista_pedidos_externos enable row level security;
revoke all on public.ebd_revista_pedidos_externos from public, anon, authenticated;
grant select on public.ebd_revista_pedidos_externos to authenticated;
drop policy if exists ebd_revista_pedidos_externos_select on public.ebd_revista_pedidos_externos;
create policy ebd_revista_pedidos_externos_select on public.ebd_revista_pedidos_externos
  for select to authenticated using (public.can_gerir_ebd(church_id));

-- Itens válidos: revistas do trimestre, sem repetir, quantidade de 1 a 2000.
create or replace function public.ebd_revistas_itens_validos(p_trimestre_id uuid, p_itens jsonb, p_maximo integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_typeof(p_itens) = 'array'
    and jsonb_array_length(p_itens) between 1 and 60
    and (select count(distinct e->>'revista_id') from jsonb_array_elements(p_itens) e) = jsonb_array_length(p_itens)
    and not exists (
      select 1 from jsonb_array_elements(p_itens) e
      where (e->>'quantidade') !~ '^\d{1,5}$' or (e->>'quantidade')::int not between 1 and p_maximo
    )
    and (
      select count(*) from jsonb_array_elements(p_itens) e
      join public.ebd_revistas r on r.id::text = e->>'revista_id'
        and r.trimestre_id = p_trimestre_id and r.deleted_at is null
    ) = jsonb_array_length(p_itens);
$$;

create or replace function public.ebd_salvar_pedido_externo(
  p_id uuid,
  p_trimestre_id uuid,
  p_nome text,
  p_itens jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church uuid := public.ebd_revistas_contexto(p_trimestre_id, null);
  v_nome text := btrim(coalesce(p_nome, ''));
  v_id uuid;
begin
  if v_church is null then
    raise exception 'trimestre nao encontrado' using errcode = 'P0002';
  end if;
  if char_length(v_nome) not between 2 and 120 or not public.ebd_revistas_itens_validos(p_trimestre_id, p_itens, 2000) then
    raise exception 'pedido invalido' using errcode = '23514';
  end if;
  if p_id is null then
    insert into public.ebd_revista_pedidos_externos (church_id, trimestre_id, nome_congregacao, itens, created_by)
    values (v_church, p_trimestre_id, v_nome, p_itens, auth.uid())
    returning id into v_id;
  else
    update public.ebd_revista_pedidos_externos
    set nome_congregacao = v_nome, itens = p_itens
    where id = p_id and church_id = v_church and trimestre_id = p_trimestre_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'pedido nao encontrado' using errcode = 'P0002';
    end if;
  end if;
  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  select c.company_id, auth.uid(), 'ebd.revista_pedido_congregacao', 'ebd_revista_pedido_externo', v_id,
         jsonb_build_object('congregacao', v_nome, 'itens', p_itens)
  from public.churches c where c.id = v_church;
  return v_id;
end;
$$;

create or replace function public.ebd_remover_pedido_externo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.ebd_revista_pedidos_externos%rowtype;
begin
  select * into v_pedido from public.ebd_revista_pedidos_externos where id = p_id and deleted_at is null;
  if v_pedido.id is null or not public.can_gerir_ebd(v_pedido.church_id) then
    raise exception 'pedido nao encontrado' using errcode = 'P0002';
  end if;
  update public.ebd_revista_pedidos_externos set deleted_at = now() where id = p_id;
  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_pedido.company_id, auth.uid(), 'ebd.revista_pedido_congregacao_removido', 'ebd_revista_pedido_externo', p_id,
          jsonb_build_object('congregacao', v_pedido.nome_congregacao));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. A aba Rede: quanto cada igreja pediu de cada revista (só números)
-- ---------------------------------------------------------------------------
create or replace function public.ebd_revistas_rede(p_trimestre_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with dona as (
    select t.church_id as id from public.ebd_trimestres t
    where t.id = p_trimestre_id and t.deleted_at is null and public.can_gerir_ebd(t.church_id)
      and public.ebd_revistas_dona(t.church_id) = t.church_id
  ),
  igrejas as (
    select c.id, concat_ws(' · ', c.name, nullif(btrim(coalesce(c.sobrenome, '')), '')) as nome, c.id = dona.id as propria
    from dona join public.churches c
      on c.deleted_at is null and (c.id = dona.id or (c.parent_id = dona.id and c.tipo = 'congregacao'))
  )
  select jsonb_build_object(
    'igrejas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'church_id', i.id,
        'nome', i.nome,
        'propria', i.propria,
        'pedidos', (
          select count(*) from public.ebd_revista_pedidos p
          where p.church_id = i.id and p.trimestre_id = p_trimestre_id and p.deleted_at is null and p.cancelado_em is null
        ),
        'itens', (
          select coalesce(jsonb_agg(jsonb_build_object('revista_id', x.revista_id, 'quantidade', x.quantidade)), '[]'::jsonb)
          from (
            select it.revista_id, sum(it.quantidade)::int as quantidade
            from public.ebd_revista_pedidos p
            join public.ebd_revista_pedido_itens it on it.pedido_id = p.id
            where p.church_id = i.id and p.trimestre_id = p_trimestre_id and p.deleted_at is null and p.cancelado_em is null
            group by it.revista_id
          ) x
        )
      ) order by i.propria desc, i.nome), '[]'::jsonb)
      from igrejas i
    ),
    'externos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'nome', e.nome_congregacao, 'itens', e.itens
      ) order by e.nome_congregacao), '[]'::jsonb)
      from public.ebd_revista_pedidos_externos e
      join dona on dona.id = e.church_id
      where e.trimestre_id = p_trimestre_id and e.deleted_at is null
    )
  )
  from dona;
$$;

-- ---------------------------------------------------------------------------
-- 4. Pedidos dos alunos: agora numa igreja que pode usar a lista de cima
-- ---------------------------------------------------------------------------
drop function if exists public.ebd_revistas_do_trimestre(uuid);
create function public.ebd_revistas_do_trimestre(p_trimestre_id uuid, p_church_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with igreja as (select public.ebd_revistas_contexto(p_trimestre_id, p_church_id) as id)
  select jsonb_build_object(
    'revistas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'titulo', r.titulo, 'preco_centavos', r.preco_centavos,
        'classe_id', r.classe_id, 'classe_nome', k.nome
      ) order by k.ordem nulls last, r.titulo), '[]'::jsonb)
      from public.ebd_revistas r
      left join public.ebd_classes k on k.id = r.classe_id
      where r.trimestre_id = p_trimestre_id and r.deleted_at is null
    ),
    'pedidos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'membro_id', p.membro_id,
        'nome', coalesce(m.nome, p.nome_avulso),
        'telefone', coalesce(m.whatsapp, p.telefone_avulso),
        'de_fora', p.membro_id is null,
        'classe_nome', (
          select k.nome from public.ebd_matriculas mt join public.ebd_classes k on k.id = mt.classe_id
          where mt.membro_id = p.membro_id and mt.ate is null limit 1
        ),
        'observacao', p.observacao,
        'entregue_em', p.entregue_em,
        'cancelado', p.cancelado_em is not null,
        'criado_em', p.created_at,
        'itens', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'revista_id', i.revista_id, 'titulo', r.titulo,
            'quantidade', i.quantidade, 'preco_centavos', i.preco_centavos
          ) order by r.titulo), '[]'::jsonb)
          from public.ebd_revista_pedido_itens i
          join public.ebd_revistas r on r.id = i.revista_id
          where i.pedido_id = p.id
        ),
        'pagamentos', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', g.id, 'valor_centavos', g.valor_centavos, 'data', g.data, 'forma', g.forma
          ) order by g.data, g.created_at), '[]'::jsonb)
          from public.ebd_revista_pagamentos g
          where g.pedido_id = p.id and g.deleted_at is null
        )
      ) order by coalesce(m.nome, p.nome_avulso)), '[]'::jsonb)
      from public.ebd_revista_pedidos p
      left join public.rol_membros m on m.id = p.membro_id
      where p.trimestre_id = p_trimestre_id and p.church_id = igreja.id and p.deleted_at is null
    ),
    'sem_pedido', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'membro_id', m.id, 'nome', m.nome, 'classe_id', k.id, 'classe_nome', k.nome
      ) order by k.ordem, k.nome, m.nome), '[]'::jsonb)
      from public.ebd_matriculas mt
      join public.ebd_classes k on k.id = mt.classe_id and k.deleted_at is null and k.ativa
      join public.rol_membros m on m.id = mt.membro_id and m.deleted_at is null
      where mt.church_id = igreja.id and mt.ate is null
        and not exists (
          select 1 from public.ebd_revista_pedidos p
          where p.trimestre_id = p_trimestre_id and p.membro_id = m.id
            and p.deleted_at is null and p.cancelado_em is null
        )
    )
  )
  from igreja
  where igreja.id is not null;
$$;

drop function if exists public.ebd_salvar_pedido_revista(uuid, uuid, uuid, text, text, text, jsonb);
create function public.ebd_salvar_pedido_revista(
  p_id uuid,
  p_trimestre_id uuid,
  p_membro_id uuid,
  p_nome text,
  p_telefone text,
  p_observacao text,
  p_itens jsonb,
  p_church_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church uuid := public.ebd_revistas_contexto(p_trimestre_id, p_church_id);
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_telefone text := nullif(btrim(coalesce(p_telefone, '')), '');
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_id uuid := p_id;
begin
  if v_church is null then
    raise exception 'trimestre nao encontrado' using errcode = 'P0002';
  end if;
  if not public.ebd_revistas_itens_validos(p_trimestre_id, p_itens, 200) then
    raise exception 'revista de outro trimestre, repetida ou quantidade invalida' using errcode = '23514';
  end if;

  if v_id is null then
    if p_membro_id is not null and not exists (
      select 1 from public.rol_membros where id = p_membro_id and church_id = v_church and deleted_at is null
    ) then
      raise exception 'pessoa de outra igreja' using errcode = '23514';
    end if;
    if p_membro_id is null and v_nome is null then
      raise exception 'pedido sem nome' using errcode = '23514';
    end if;
    insert into public.ebd_revista_pedidos (
      church_id, trimestre_id, membro_id, nome_avulso, telefone_avulso, observacao, created_by
    ) values (
      v_church, p_trimestre_id, p_membro_id,
      case when p_membro_id is null then v_nome end,
      case when p_membro_id is null then v_telefone end,
      v_obs, auth.uid()
    ) returning id into v_id;
  else
    -- Quem pediu não muda; de alguém de fora, dá para corrigir nome e telefone.
    update public.ebd_revista_pedidos p
    set observacao = v_obs,
        nome_avulso = case when p.membro_id is null then coalesce(v_nome, p.nome_avulso) end,
        telefone_avulso = case when p.membro_id is null then v_telefone end
    where p.id = v_id and p.trimestre_id = p_trimestre_id and p.church_id = v_church
      and p.deleted_at is null and p.cancelado_em is null
    returning p.id into v_id;
    if v_id is null then
      raise exception 'pedido nao encontrado' using errcode = 'P0002';
    end if;
  end if;

  delete from public.ebd_revista_pedido_itens i
  where i.pedido_id = v_id
    and not exists (select 1 from jsonb_array_elements(p_itens) e where (e->>'revista_id')::uuid = i.revista_id);
  insert into public.ebd_revista_pedido_itens (pedido_id, revista_id, church_id, quantidade, preco_centavos)
  select v_id, r.id, v_church, (e->>'quantidade')::integer, r.preco_centavos
  from jsonb_array_elements(p_itens) e
  join public.ebd_revistas r on r.id = (e->>'revista_id')::uuid
  on conflict (pedido_id, revista_id) do update set quantidade = excluded.quantidade;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  select c.company_id, auth.uid(),
         case when p_id is null then 'ebd.revista_pedido_criado' else 'ebd.revista_pedido_alterado' end,
         'ebd_revista_pedido', v_id, jsonb_build_object('itens', p_itens)
  from public.churches c where c.id = v_church;
  return v_id;
end;
$$;

-- A revista do item é de outra igreja (a de cima) quando a congregação usa a
-- lista dela: o item pertence à igreja do pedido.
-- (ebd_revista_pedido_itens.church_id = igreja do pedido; a policy de leitura
-- continua sendo a gestão da EBD dessa igreja.)

-- ---------------------------------------------------------------------------
-- 5. Permissões
-- ---------------------------------------------------------------------------
revoke all on function public.ebd_revistas_dona(uuid) from public, anon, authenticated;
revoke all on function public.ebd_revistas_contexto(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ebd_revistas_lista_da_igreja(uuid) from public, anon, authenticated;
revoke all on function public.ebd_revistas_itens_validos(uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function public.ebd_salvar_pedido_externo(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.ebd_remover_pedido_externo(uuid) from public, anon, authenticated;
revoke all on function public.ebd_revistas_rede(uuid) from public, anon, authenticated;
revoke all on function public.ebd_revistas_do_trimestre(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ebd_salvar_pedido_revista(uuid, uuid, uuid, text, text, text, jsonb, uuid) from public, anon, authenticated;

grant execute on function public.ebd_revistas_lista_da_igreja(uuid) to authenticated;
grant execute on function public.ebd_salvar_pedido_externo(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.ebd_remover_pedido_externo(uuid) to authenticated;
grant execute on function public.ebd_revistas_rede(uuid) to authenticated;
grant execute on function public.ebd_revistas_do_trimestre(uuid, uuid) to authenticated;
grant execute on function public.ebd_salvar_pedido_revista(uuid, uuid, uuid, text, text, text, jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
