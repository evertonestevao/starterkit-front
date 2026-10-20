-- EBD → Revistas: pedidos de revista por trimestre.
--
-- O aluno (ou o professor, ou alguém de fora da EBD) pede a revista ao
-- secretário da EBD, que controla aqui o que cada um pediu, quanto já pagou
-- (pode ser em partes) e se já recebeu. O resumo por revista é a lista de
-- compra do trimestre.
--
-- Quem usa: só a gestão da EBD da PRÓPRIA igreja (can_gerir_ebd: Responsável,
-- Administrador e quem tem o módulo EBD pelo cargo). Professor não entra. A
-- igreja de cima não vê.
--
-- Dinheiro: é o caixa das revistas, controlado só aqui. Não entra na
-- Tesouraria nem na oferta da EBD.
--
-- Escrita só pelas funções abaixo (security definer), que conferem a igreja:
-- o client não grava as tabelas direto. O preço fica gravado no item na hora
-- do pedido, para o pedido não mudar se o preço da revista mudar depois.

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.ebd_revistas (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  trimestre_id uuid not null references public.ebd_trimestres (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 2 and 80),
  preco_centavos integer not null check (preco_centavos between 0 and 1000000),
  -- Classe que costuma usar esta revista: serve para sugerir no pedido.
  classe_id uuid references public.ebd_classes (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ebd_revistas_trimestre_idx on public.ebd_revistas (trimestre_id) where deleted_at is null;

create table if not exists public.ebd_revista_pedidos (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  trimestre_id uuid not null references public.ebd_trimestres (id) on delete cascade,
  -- Quem pediu: alguém do cadastro, ou só o nome (pessoa de fora).
  membro_id uuid references public.rol_membros (id) on delete set null,
  nome_avulso text check (nome_avulso is null or char_length(nome_avulso) between 2 and 120),
  telefone_avulso text check (telefone_avulso is null or char_length(telefone_avulso) between 8 and 20),
  observacao text check (observacao is null or char_length(observacao) <= 300),
  entregue_em date,
  cancelado_em timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ebd_revista_pedidos_de_quem check (membro_id is not null or nome_avulso is not null)
);
create index if not exists ebd_revista_pedidos_trimestre_idx
  on public.ebd_revista_pedidos (trimestre_id) where deleted_at is null;
-- Uma pessoa do cadastro tem um pedido ativo por trimestre (mais revistas = mais itens).
create unique index if not exists ebd_revista_pedidos_um_por_membro
  on public.ebd_revista_pedidos (trimestre_id, membro_id)
  where membro_id is not null and deleted_at is null and cancelado_em is null;

create table if not exists public.ebd_revista_pedido_itens (
  pedido_id uuid not null references public.ebd_revista_pedidos (id) on delete cascade,
  revista_id uuid not null references public.ebd_revistas (id) on delete restrict,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  quantidade integer not null check (quantidade between 1 and 200),
  -- Preço da revista no dia do pedido.
  preco_centavos integer not null check (preco_centavos between 0 and 1000000),
  primary key (pedido_id, revista_id)
);

create table if not exists public.ebd_revista_pagamentos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.ebd_revista_pedidos (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  valor_centavos integer not null check (valor_centavos between 1 and 10000000),
  data date not null default current_date,
  forma text not null default 'dinheiro' check (forma in ('dinheiro', 'pix', 'outro')),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ebd_revista_pagamentos_pedido_idx
  on public.ebd_revista_pagamentos (pedido_id) where deleted_at is null;

do $$
declare t text;
begin
  foreach t in array array['ebd_revistas', 'ebd_revista_pedidos', 'ebd_revista_pedido_itens', 'ebd_revista_pagamentos'] loop
    execute format('drop trigger if exists set_%1$s_company_id on public.%1$s', t);
    execute format(
      'create trigger set_%1$s_company_id before insert or update of church_id on public.%1$s
         for each row execute function public.set_company_id_from_church()', t);
    execute format('alter table public.%I enable row level security', t);
    -- Tabela nova nasce com ALL para todos: tira tudo e devolve só a leitura.
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated using (public.can_gerir_ebd(church_id))', t);
  end loop;
end $$;

drop trigger if exists set_ebd_revistas_updated_at on public.ebd_revistas;
create trigger set_ebd_revistas_updated_at before update on public.ebd_revistas
  for each row execute function public.set_updated_at();
drop trigger if exists set_ebd_revista_pedidos_updated_at on public.ebd_revista_pedidos;
create trigger set_ebd_revista_pedidos_updated_at before update on public.ebd_revista_pedidos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Apoio
-- ---------------------------------------------------------------------------
-- A igreja do trimestre, se quem pede é da gestão da EBD dela; senão, null.
create or replace function public.ebd_revistas_igreja(p_trimestre_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.church_id from public.ebd_trimestres t
  where t.id = p_trimestre_id and t.deleted_at is null and public.can_gerir_ebd(t.church_id);
$$;

-- ---------------------------------------------------------------------------
-- 3. Revistas do trimestre
-- ---------------------------------------------------------------------------
create or replace function public.ebd_salvar_revista(
  p_id uuid,
  p_trimestre_id uuid,
  p_titulo text,
  p_preco_centavos integer,
  p_classe_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church uuid := public.ebd_revistas_igreja(p_trimestre_id);
  v_id uuid;
begin
  if v_church is null then
    raise exception 'trimestre nao encontrado' using errcode = 'P0002';
  end if;
  if p_classe_id is not null and not exists (
    select 1 from public.ebd_classes where id = p_classe_id and church_id = v_church and deleted_at is null
  ) then
    raise exception 'classe de outra igreja' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.ebd_revistas (church_id, trimestre_id, titulo, preco_centavos, classe_id)
    values (v_church, p_trimestre_id, btrim(p_titulo), p_preco_centavos, p_classe_id)
    returning id into v_id;
  else
    -- Mudar o preço não mexe nos pedidos já feitos (o item guarda o preço dele).
    update public.ebd_revistas
    set titulo = btrim(p_titulo), preco_centavos = p_preco_centavos, classe_id = p_classe_id
    where id = p_id and trimestre_id = p_trimestre_id and church_id = v_church and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'revista nao encontrada' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

-- Tira a revista da lista. Com pedido ativo usando, não sai.
create or replace function public.ebd_remover_revista(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revista public.ebd_revistas%rowtype;
begin
  select * into v_revista from public.ebd_revistas where id = p_id and deleted_at is null;
  if v_revista.id is null or not public.can_gerir_ebd(v_revista.church_id) then
    raise exception 'revista nao encontrada' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.ebd_revista_pedido_itens i
    join public.ebd_revista_pedidos p on p.id = i.pedido_id and p.deleted_at is null and p.cancelado_em is null
    where i.revista_id = p_id
  ) then
    raise exception 'revista com pedido' using errcode = '23503';
  end if;
  update public.ebd_revistas set deleted_at = now() where id = p_id;
end;
$$;

-- Copia as revistas de outro trimestre (título, preço e classe) que ainda não existem neste.
create or replace function public.ebd_copiar_revistas(p_de_trimestre_id uuid, p_para_trimestre_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church uuid := public.ebd_revistas_igreja(p_para_trimestre_id);
  v_quantas integer;
begin
  if v_church is null or public.ebd_revistas_igreja(p_de_trimestre_id) is distinct from v_church then
    raise exception 'trimestre nao encontrado' using errcode = 'P0002';
  end if;
  insert into public.ebd_revistas (church_id, trimestre_id, titulo, preco_centavos, classe_id)
  select v_church, p_para_trimestre_id, r.titulo, r.preco_centavos, r.classe_id
  from public.ebd_revistas r
  where r.trimestre_id = p_de_trimestre_id and r.deleted_at is null
    and not exists (
      select 1 from public.ebd_revistas n
      where n.trimestre_id = p_para_trimestre_id and n.deleted_at is null and lower(n.titulo) = lower(r.titulo)
    );
  get diagnostics v_quantas = row_count;
  return v_quantas;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Pedidos
-- ---------------------------------------------------------------------------
-- Tudo do trimestre numa ida: revistas, pedidos (com itens e pagamentos) e
-- quem está matriculado e ainda não pediu.
create or replace function public.ebd_revistas_do_trimestre(p_trimestre_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with igreja as (select public.ebd_revistas_igreja(p_trimestre_id) as id)
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
      where p.trimestre_id = p_trimestre_id and p.deleted_at is null
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

-- Cria ou altera o pedido. p_itens: [{"revista_id": uuid, "quantidade": int}].
-- Na alteração, revista que já estava no pedido mantém o preço de quando entrou.
create or replace function public.ebd_salvar_pedido_revista(
  p_id uuid,
  p_trimestre_id uuid,
  p_membro_id uuid,
  p_nome text,
  p_telefone text,
  p_observacao text,
  p_itens jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church uuid := public.ebd_revistas_igreja(p_trimestre_id);
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_telefone text := nullif(btrim(coalesce(p_telefone, '')), '');
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_id uuid := p_id;
  v_quantos integer;
begin
  if v_church is null then
    raise exception 'trimestre nao encontrado' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'pedido sem revista' using errcode = '23514';
  end if;
  -- Toda revista do pedido é deste trimestre (e, portanto, desta igreja).
  select count(*) into v_quantos
  from jsonb_array_elements(p_itens) e
  join public.ebd_revistas r on r.id = (e->>'revista_id')::uuid
    and r.trimestre_id = p_trimestre_id and r.deleted_at is null;
  if v_quantos <> jsonb_array_length(p_itens)
     or (select count(distinct e->>'revista_id') from jsonb_array_elements(p_itens) e) <> v_quantos then
    raise exception 'revista de outro trimestre ou repetida' using errcode = '23514';
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

-- O pedido, se é da gestão da EBD de quem pede e está ativo.
create or replace function public.ebd_pedido_revista_ativo(p_pedido_id uuid)
returns public.ebd_revista_pedidos
language sql
stable
security definer
set search_path = public
as $$
  select p from public.ebd_revista_pedidos p
  where p.id = p_pedido_id and p.deleted_at is null and p.cancelado_em is null
    and public.can_gerir_ebd(p.church_id);
$$;

-- Pagamento (pode ser parte do valor). Não deixa passar do total do pedido.
create or replace function public.ebd_registrar_pagamento_revista(
  p_pedido_id uuid,
  p_valor_centavos integer,
  p_data date,
  p_forma text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.ebd_revista_pedidos := public.ebd_pedido_revista_ativo(p_pedido_id);
  v_total bigint;
  v_pago bigint;
  v_id uuid;
begin
  if v_pedido.id is null then
    raise exception 'pedido nao encontrado' using errcode = 'P0002';
  end if;
  -- Trava o pedido: dois pagamentos ao mesmo tempo não passam juntos do total.
  perform 1 from public.ebd_revista_pedidos where id = p_pedido_id for update;
  select coalesce(sum(quantidade * preco_centavos), 0) into v_total
  from public.ebd_revista_pedido_itens where pedido_id = p_pedido_id;
  select coalesce(sum(valor_centavos), 0) into v_pago
  from public.ebd_revista_pagamentos where pedido_id = p_pedido_id and deleted_at is null;
  if p_valor_centavos is null or p_valor_centavos < 1 or v_pago + p_valor_centavos > v_total then
    raise exception 'valor maior que o que falta' using errcode = '23514';
  end if;
  if p_data is null or p_data > current_date + 1 or p_data < current_date - 400 then
    raise exception 'data invalida' using errcode = '23514';
  end if;

  insert into public.ebd_revista_pagamentos (pedido_id, church_id, valor_centavos, data, forma, created_by)
  values (p_pedido_id, v_pedido.church_id, p_valor_centavos, p_data, coalesce(p_forma, 'dinheiro'), auth.uid())
  returning id into v_id;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_pedido.company_id, auth.uid(), 'ebd.revista_pagamento', 'ebd_revista_pedido', p_pedido_id,
          jsonb_build_object('valor_centavos', p_valor_centavos, 'forma', coalesce(p_forma, 'dinheiro'), 'data', p_data));
  return v_id;
end;
$$;

-- Lançado errado: tira o pagamento (fica registrado na auditoria).
create or replace function public.ebd_estornar_pagamento_revista(p_pagamento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pag public.ebd_revista_pagamentos%rowtype;
begin
  select * into v_pag from public.ebd_revista_pagamentos where id = p_pagamento_id and deleted_at is null;
  if v_pag.id is null or not public.can_gerir_ebd(v_pag.church_id) then
    raise exception 'pagamento nao encontrado' using errcode = 'P0002';
  end if;
  update public.ebd_revista_pagamentos set deleted_at = now() where id = p_pagamento_id;
  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_pag.company_id, auth.uid(), 'ebd.revista_pagamento_estornado', 'ebd_revista_pedido', v_pag.pedido_id,
          jsonb_build_object('valor_centavos', v_pag.valor_centavos, 'data', v_pag.data));
end;
$$;

-- Entrega: tudo ou nada.
create or replace function public.ebd_marcar_entrega_revista(p_pedido_id uuid, p_entregue boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.ebd_revista_pedidos := public.ebd_pedido_revista_ativo(p_pedido_id);
begin
  if v_pedido.id is null then
    raise exception 'pedido nao encontrado' using errcode = 'P0002';
  end if;
  update public.ebd_revista_pedidos
  set entregue_em = case when coalesce(p_entregue, false) then current_date end
  where id = p_pedido_id;
  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_pedido.company_id, auth.uid(), 'ebd.revista_entrega', 'ebd_revista_pedido', p_pedido_id,
          jsonb_build_object('entregue', coalesce(p_entregue, false)));
end;
$$;

-- Cancela o pedido. Sem pagamento, some da lista; com pagamento, fica como
-- cancelado (o dinheiro recebido continua aparecendo, para devolver ou acertar).
create or replace function public.ebd_cancelar_pedido_revista(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.ebd_revista_pedidos := public.ebd_pedido_revista_ativo(p_pedido_id);
  v_tem_pagamento boolean;
begin
  if v_pedido.id is null then
    raise exception 'pedido nao encontrado' using errcode = 'P0002';
  end if;
  select exists (
    select 1 from public.ebd_revista_pagamentos where pedido_id = p_pedido_id and deleted_at is null
  ) into v_tem_pagamento;
  update public.ebd_revista_pedidos
  set cancelado_em = now(), deleted_at = case when v_tem_pagamento then null else now() end
  where id = p_pedido_id;
  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_pedido.company_id, auth.uid(), 'ebd.revista_pedido_cancelado', 'ebd_revista_pedido', p_pedido_id,
          jsonb_build_object('tinha_pagamento', v_tem_pagamento));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permissões: função nasce executável por todos — tira e devolve só a quem usa.
-- ---------------------------------------------------------------------------
revoke all on function public.ebd_revistas_igreja(uuid) from public, anon, authenticated;
revoke all on function public.ebd_salvar_revista(uuid, uuid, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.ebd_remover_revista(uuid) from public, anon, authenticated;
revoke all on function public.ebd_copiar_revistas(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ebd_revistas_do_trimestre(uuid) from public, anon, authenticated;
revoke all on function public.ebd_salvar_pedido_revista(uuid, uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ebd_pedido_revista_ativo(uuid) from public, anon, authenticated;
revoke all on function public.ebd_registrar_pagamento_revista(uuid, integer, date, text) from public, anon, authenticated;
revoke all on function public.ebd_estornar_pagamento_revista(uuid) from public, anon, authenticated;
revoke all on function public.ebd_marcar_entrega_revista(uuid, boolean) from public, anon, authenticated;
revoke all on function public.ebd_cancelar_pedido_revista(uuid) from public, anon, authenticated;

grant execute on function public.ebd_salvar_revista(uuid, uuid, text, integer, uuid) to authenticated;
grant execute on function public.ebd_remover_revista(uuid) to authenticated;
grant execute on function public.ebd_copiar_revistas(uuid, uuid) to authenticated;
grant execute on function public.ebd_revistas_do_trimestre(uuid) to authenticated;
grant execute on function public.ebd_salvar_pedido_revista(uuid, uuid, uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.ebd_registrar_pagamento_revista(uuid, integer, date, text) to authenticated;
grant execute on function public.ebd_estornar_pagamento_revista(uuid) to authenticated;
grant execute on function public.ebd_marcar_entrega_revista(uuid, boolean) to authenticated;
grant execute on function public.ebd_cancelar_pedido_revista(uuid) to authenticated;

notify pgrst, 'reload schema';
