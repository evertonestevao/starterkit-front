-- Vendas com opções: sabores de pastel, tamanhos de camiseta.
--
-- Na criação a pessoa responde se a venda tem opções. Com opções, quem compra
-- escolhe a quantidade de CADA uma (2 de carne, 1 de queijo) e o total soma
-- tudo. Cada opção pode ter preço próprio (camiseta GG mais cara); sem preço,
-- vale o da venda. O estoque continua sendo um só, da venda inteira.
--
-- O pedido passa a ter itens. Venda sem opções grava um item só, com o nome
-- da venda: o relatório e a planilha leem tudo do mesmo jeito. O item guarda
-- nome e preço do momento da compra — renomear ou tirar a opção depois não
-- muda pedido antigo. Opção que sai da venda é desativada, não apagada.
--
-- Nome e preço das opções não passam pela confirmação do Responsável: não
-- mudam para onde vai o dinheiro (isso é só a chave Pix e o WhatsApp).

alter table public.vendas add column tem_opcoes boolean not null default false;

-- Pedido com opções não tem um preço unitário só.
alter table public.venda_pedidos alter column preco_unitario_cents drop not null;

-- ---------------------------------------------------------------------------
-- 1. Opções
-- ---------------------------------------------------------------------------
create table public.venda_opcoes (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  -- Null = o preço da venda.
  preco_cents integer check (preco_cents is null or (preco_cents > 0 and preco_cents <= 10000000)),
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index venda_opcoes_venda_idx on public.venda_opcoes (venda_id, ordem);

create or replace function public.set_company_id_from_venda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select v.company_id into new.company_id from public.vendas v where v.id = new.venda_id;
  return new;
end;
$$;

revoke all on function public.set_company_id_from_venda() from public, anon, authenticated;

create trigger set_venda_opcoes_company_id
  before insert or update of venda_id on public.venda_opcoes
  for each row execute function public.set_company_id_from_venda();

alter table public.venda_opcoes enable row level security;
revoke all on public.venda_opcoes from anon, authenticated;
grant select on public.venda_opcoes to authenticated;

create policy venda_opcoes_select_quem_cuida on public.venda_opcoes
  for select to authenticated
  using (company_id is not null and public.tem_acesso(company_id, 'vendas'));

-- ---------------------------------------------------------------------------
-- 2. Itens do pedido
-- ---------------------------------------------------------------------------
create table public.venda_pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.venda_pedidos (id) on delete cascade,
  venda_id uuid not null references public.vendas (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  opcao_id uuid references public.venda_opcoes (id) on delete set null,
  nome text not null check (char_length(nome) between 1 and 120),
  quantidade integer not null check (quantidade between 1 and 1000),
  preco_unitario_cents integer not null check (preco_unitario_cents > 0),
  total_cents integer not null check (total_cents > 0)
);

create index venda_pedido_itens_pedido_idx on public.venda_pedido_itens (pedido_id);
create index venda_pedido_itens_venda_idx on public.venda_pedido_itens (venda_id);

create trigger set_venda_pedido_itens_company_id
  before insert or update of venda_id on public.venda_pedido_itens
  for each row execute function public.set_company_id_from_venda();

alter table public.venda_pedido_itens enable row level security;
revoke all on public.venda_pedido_itens from anon, authenticated;
grant select on public.venda_pedido_itens to authenticated;

create policy venda_pedido_itens_select_quem_cuida on public.venda_pedido_itens
  for select to authenticated
  using (company_id is not null and public.tem_acesso(company_id, 'vendas'));

-- Pedidos que já existem (feitos antes das opções) viram um item cada.
insert into public.venda_pedido_itens (pedido_id, venda_id, nome, quantidade, preco_unitario_cents, total_cents)
select pd.id, pd.venda_id, v.titulo, pd.quantidade, pd.preco_unitario_cents, pd.total_cents
from public.venda_pedidos pd
join public.vendas v on v.id = pd.venda_id
where pd.preco_unitario_cents is not null
  and not exists (select 1 from public.venda_pedido_itens i where i.pedido_id = pd.id);

-- ---------------------------------------------------------------------------
-- 3. Salvar a venda (agora com as opções)
-- ---------------------------------------------------------------------------
-- p.tem_opcoes e p.opcoes = [{id?, nome, preco_cents?}] na ordem da tela.
-- Opção com id é atualizada; sem id, criada; a que sumiu da lista é
-- desativada (pedido antigo continua apontando para ela).
create or replace function public.salvar_venda(p_church_id uuid, p_id uuid, p jsonb)
returns table (id uuid, precisa_confirmar boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_atual public.vendas%rowtype;
  v_id uuid;
  v_precisa boolean;
  v_titulo text := btrim(coalesce(p ->> 'titulo', ''));
  v_descricao text := nullif(btrim(coalesce(p ->> 'descricao', '')), '');
  v_chave text := btrim(coalesce(p ->> 'pix_chave', ''));
  v_titular text := btrim(coalesce(p ->> 'pix_titular', ''));
  v_whats text := nullif(regexp_replace(coalesce(p ->> 'whatsapp_comprovante', ''), '\D', '', 'g'), '');
  v_tem_opcoes boolean := coalesce((p ->> 'tem_opcoes')::boolean, false);
  v_opcoes jsonb := coalesce(p -> 'opcoes', '[]'::jsonb);
  v_item jsonb;
  v_ordem integer := 0;
  v_mantidas uuid[] := '{}';
  v_opcao_id uuid;
begin
  select company_id into v_company from public.churches where churches.id = p_church_id and deleted_at is null;
  if v_company is null or not public.tem_acesso(v_company, 'vendas') then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;

  if jsonb_typeof(v_opcoes) <> 'array' or jsonb_array_length(v_opcoes) > 40 then
    raise exception 'lista de opções inválida' using errcode = '22023';
  end if;
  if v_tem_opcoes and jsonb_array_length(v_opcoes) = 0 then
    raise exception 'informe as opções' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.vendas (
      church_id, titulo, descricao, preco_cents, pix_chave, pix_titular, whatsapp_comprovante, tem_opcoes,
      encerra_em, estoque, max_por_pedido, criado_por
    )
    values (
      p_church_id, v_titulo, v_descricao, (p ->> 'preco_cents')::integer, v_chave, v_titular, v_whats, v_tem_opcoes,
      nullif(p ->> 'encerra_em', '')::date, nullif(p ->> 'estoque', '')::integer,
      nullif(p ->> 'max_por_pedido', '')::integer, auth.uid()
    )
    returning vendas.id into v_id;
    v_precisa := true;
  else
    select * into v_atual from public.vendas
    where vendas.id = p_id and church_id = p_church_id and deleted_at is null
    for update;
    if v_atual.id is null then
      raise exception 'venda não encontrada' using errcode = 'P0002';
    end if;

    update public.vendas set
      titulo = v_titulo,
      descricao = v_descricao,
      preco_cents = (p ->> 'preco_cents')::integer,
      pix_chave = v_chave,
      pix_titular = v_titular,
      whatsapp_comprovante = v_whats,
      tem_opcoes = v_tem_opcoes,
      encerra_em = nullif(p ->> 'encerra_em', '')::date,
      estoque = nullif(p ->> 'estoque', '')::integer,
      max_por_pedido = nullif(p ->> 'max_por_pedido', '')::integer
    where vendas.id = p_id;

    v_id := p_id;
    v_precisa := v_atual.pix_chave is distinct from v_chave or v_atual.pix_titular is distinct from v_titular
                 or v_atual.whatsapp_comprovante is distinct from v_whats or v_atual.pix_confirmado_em is null;
  end if;

  if v_tem_opcoes then
    for v_item in select value from jsonb_array_elements(v_opcoes) loop
      v_ordem := v_ordem + 1;
      v_opcao_id := nullif(v_item ->> 'id', '')::uuid;
      if v_opcao_id is not null then
        update public.venda_opcoes set
          nome = btrim(coalesce(v_item ->> 'nome', '')),
          preco_cents = nullif(v_item ->> 'preco_cents', '')::integer,
          ordem = v_ordem,
          ativo = true
        where venda_opcoes.id = v_opcao_id and venda_id = v_id;
        if not found then v_opcao_id := null; end if;
      end if;
      if v_opcao_id is null then
        insert into public.venda_opcoes (venda_id, nome, preco_cents, ordem)
        values (v_id, btrim(coalesce(v_item ->> 'nome', '')), nullif(v_item ->> 'preco_cents', '')::integer, v_ordem)
        returning venda_opcoes.id into v_opcao_id;
      end if;
      v_mantidas := v_mantidas || v_opcao_id;
    end loop;
  end if;

  -- O que saiu da lista (ou tudo, se a venda deixou de ter opções) fica desativado.
  update public.venda_opcoes set ativo = false
  where venda_id = v_id and ativo and not (venda_opcoes.id = any (v_mantidas));

  return query select v_id, v_precisa;
end;
$$;

revoke all on function public.salvar_venda(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_venda(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Página pública: a lista leva as opções (com o preço que vale)
-- ---------------------------------------------------------------------------
drop function public.vendas_publicas(uuid);
create function public.vendas_publicas(p_church_id uuid)
returns table (
  id uuid, titulo text, descricao text, preco_cents integer, encerra_em date,
  max_por_pedido integer, disponivel integer, tem_opcoes boolean, opcoes jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.titulo, v.descricao, v.preco_cents, v.encerra_em, v.max_por_pedido,
         public.venda_disponivel(v), v.tem_opcoes,
         case when v.tem_opcoes then coalesce((
           select jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'preco_cents', coalesce(o.preco_cents, v.preco_cents))
                            order by o.ordem)
           from public.venda_opcoes o where o.venda_id = v.id and o.ativo
         ), '[]'::jsonb) else '[]'::jsonb end
  from public.vendas v
  join public.churches c on c.id = v.church_id and c.deleted_at is null and c.pagina_ativa
  where v.church_id = p_church_id
    and v.deleted_at is null
    and v.status = 'ativa'
    and v.pix_confirmado_em is not null
    and (v.encerra_em is null or v.encerra_em >= (now() at time zone 'America/Sao_Paulo')::date)
    and coalesce(public.venda_disponivel(v), 1) > 0
  order by v.created_at desc;
$$;

revoke all on function public.vendas_publicas(uuid) from public, anon, authenticated;
grant execute on function public.vendas_publicas(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Pedido: com opções, p_itens = [{opcao_id, quantidade}]; sem, p_quantidade
-- ---------------------------------------------------------------------------
drop function public.criar_pedido_venda(uuid, text, text, integer, text);
create function public.criar_pedido_venda(
  p_venda_id uuid,
  p_nome text,
  p_telefone text,
  p_quantidade integer,
  p_observacao text,
  p_itens jsonb default '[]'::jsonb
)
returns table (
  pedido_id uuid, total_cents integer, pix_chave text, pix_titular text, church_name text, church_address text,
  whatsapp_comprovante text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.vendas%rowtype;
  v_igreja public.churches%rowtype;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_telefone text := btrim(coalesce(p_telefone, ''));
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_disponivel integer;
  v_id uuid;
  v_total integer := 0;
  v_unidades integer := 0;
  v_itens jsonb := coalesce(p_itens, '[]'::jsonb);
begin
  if char_length(v_nome) not between 2 and 120 then
    raise exception 'Informe seu nome' using errcode = 'P0001';
  end if;
  if char_length(v_telefone) not between 8 and 20 then
    raise exception 'Informe um WhatsApp para contato' using errcode = 'P0001';
  end if;
  if v_obs is not null and char_length(v_obs) > 500 then
    raise exception 'Observação longa demais' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_itens) <> 'array' or jsonb_array_length(v_itens) > 40 then
    raise exception 'Pedido inválido' using errcode = 'P0001';
  end if;

  select * into v_venda from public.vendas where id = p_venda_id and deleted_at is null for update;
  if v_venda.id is not null then
    select * into v_igreja from public.churches where id = v_venda.church_id and deleted_at is null;
  end if;
  if v_venda.id is null or v_igreja.id is null or not v_igreja.pagina_ativa or v_venda.pix_confirmado_em is null then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  if v_venda.status <> 'ativa'
     or (v_venda.encerra_em is not null and v_venda.encerra_em < (now() at time zone 'America/Sao_Paulo')::date) then
    raise exception 'Esta venda já foi encerrada' using errcode = 'P0001';
  end if;

  -- Os itens que valem: com opções, cada opção ativa DESTA venda com quantidade > 0
  -- (a mesma opção repetida soma); sem opções, um item com o nome da venda.
  create temporary table if not exists pg_temp.itens_do_pedido (
    opcao_id uuid, nome text, quantidade integer, preco integer
  ) on commit drop;
  truncate pg_temp.itens_do_pedido;

  if v_venda.tem_opcoes then
    if exists (
      select 1 from jsonb_to_recordset(v_itens) as i(opcao_id uuid, quantidade integer)
      where i.quantidade is null or i.quantidade < 0 or i.quantidade > 1000
         or not exists (select 1 from public.venda_opcoes o where o.id = i.opcao_id and o.venda_id = v_venda.id and o.ativo)
    ) then
      raise exception 'Alguma opção não está mais disponível. Recarregue a página.' using errcode = 'P0001';
    end if;
    insert into pg_temp.itens_do_pedido
    select o.id, o.nome, sum(i.quantidade)::integer, coalesce(o.preco_cents, v_venda.preco_cents)
    from jsonb_to_recordset(v_itens) as i(opcao_id uuid, quantidade integer)
    join public.venda_opcoes o on o.id = i.opcao_id
    where i.quantidade > 0
    group by o.id, o.nome, o.preco_cents, o.ordem
    order by o.ordem;
  else
    if p_quantidade is null or p_quantidade < 1 or p_quantidade > 1000 then
      raise exception 'Informe a quantidade' using errcode = 'P0001';
    end if;
    insert into pg_temp.itens_do_pedido values (null, v_venda.titulo, p_quantidade, v_venda.preco_cents);
  end if;

  select coalesce(sum(quantidade), 0), coalesce(sum(quantidade * preco), 0)
  into v_unidades, v_total from pg_temp.itens_do_pedido;

  if v_unidades < 1 then
    raise exception 'Escolha pelo menos uma unidade' using errcode = 'P0001';
  end if;
  if v_unidades > 1000 or v_total > 100000000 then
    raise exception 'Quantidade alta demais' using errcode = 'P0001';
  end if;
  if v_venda.max_por_pedido is not null and v_unidades > v_venda.max_por_pedido then
    raise exception 'O máximo por pedido é %', v_venda.max_por_pedido using errcode = 'P0001';
  end if;
  v_disponivel := public.venda_disponivel(v_venda);
  if v_disponivel is not null and v_unidades > v_disponivel then
    if v_disponivel = 0 then
      raise exception 'Esgotado' using errcode = 'P0001';
    end if;
    raise exception 'Só restam % unidade(s)', v_disponivel using errcode = 'P0001';
  end if;

  insert into public.venda_pedidos (venda_id, church_id, nome, telefone, quantidade, preco_unitario_cents, total_cents, observacao)
  values (
    v_venda.id, v_venda.church_id, v_nome, v_telefone, v_unidades,
    case when v_venda.tem_opcoes then null else v_venda.preco_cents end, v_total, v_obs
  )
  returning id into v_id;

  insert into public.venda_pedido_itens (pedido_id, venda_id, opcao_id, nome, quantidade, preco_unitario_cents, total_cents)
  select v_id, v_venda.id, t.opcao_id, t.nome, t.quantidade, t.preco, t.quantidade * t.preco
  from pg_temp.itens_do_pedido t;

  return query select v_id, v_total, v_venda.pix_chave, v_venda.pix_titular, v_igreja.name, v_igreja.address,
                      v_venda.whatsapp_comprovante;
end;
$$;

revoke all on function public.criar_pedido_venda(uuid, text, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.criar_pedido_venda(uuid, text, text, integer, text, jsonb) to service_role;

notify pgrst, 'reload schema';
