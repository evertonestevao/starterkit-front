-- Vendas: voucher para a retirada.
--
-- Opção na criação da venda ("Gerar voucher para retirada"). Cada pedido
-- ganha um link pessoal (o QR Code aponta para ele) e um código curto
-- (ex.: K7P-4QX) para digitar quando a câmera falhar.
--
-- Quem compra guarda o voucher. Na retirada, quem entrega aponta a câmera
-- comum do celular: logado e com o módulo Vendas, vê o pedido e marca como
-- entregue; qualquer outra pessoa vê só o voucher (primeiro nome e itens,
-- sem telefone).
--
-- Mesmo cuidado da carteirinha: o servidor gera o token do link e o banco
-- guarda só o hash — quem ler a tabela não monta um link válido. O código
-- curto sozinho não abre nada fora do painel (a busca por ele passa pela
-- RLS de quem cuida da venda).
--
-- Entrega é do pedido inteiro, com observação ("falta 1 GG"); fica gravado
-- quem marcou e quando, e desfazer limpa os dois.

alter table public.vendas add column gera_voucher boolean not null default false;

alter table public.venda_pedidos
  add column voucher_hash text unique check (voucher_hash is null or voucher_hash ~ '^[0-9a-f]{64}$'),
  add column voucher_codigo text check (voucher_codigo is null or voucher_codigo ~ '^[A-Z0-9]{3}-[A-Z0-9]{3}$'),
  add column entregue_em timestamptz,
  add column entregue_por uuid references auth.users (id) on delete set null,
  add column entrega_obs text check (entrega_obs is null or char_length(entrega_obs) <= 300);

create unique index venda_pedidos_voucher_codigo_idx on public.venda_pedidos (venda_id, voucher_codigo)
  where voucher_codigo is not null;

-- Código curto, sem letras e números que se confundem (0/O, 1/I/L).
create or replace function public.novo_codigo_voucher(p_venda_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_codigo text;
begin
  for tentativa in 1..20 loop
    v_codigo := '';
    for i in 1..6 loop
      v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    end loop;
    v_codigo := substr(v_codigo, 1, 3) || '-' || substr(v_codigo, 4, 3);
    if not exists (select 1 from public.venda_pedidos where venda_id = p_venda_id and voucher_codigo = v_codigo) then
      return v_codigo;
    end if;
  end loop;
  raise exception 'não foi possível gerar o código do voucher' using errcode = 'P0001';
end;
$$;

revoke all on function public.novo_codigo_voucher(uuid) from public, anon, authenticated;

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
  v_gera_voucher boolean := coalesce((p ->> 'gera_voucher')::boolean, false);
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
      church_id, titulo, descricao, preco_cents, pix_chave, pix_titular, whatsapp_comprovante, tem_opcoes, gera_voucher,
      encerra_em, estoque, max_por_pedido, criado_por
    )
    values (
      p_church_id, v_titulo, v_descricao, (p ->> 'preco_cents')::integer, v_chave, v_titular, v_whats, v_tem_opcoes, v_gera_voucher,
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
      gera_voucher = v_gera_voucher,
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


drop function public.criar_pedido_venda(uuid, text, text, integer, text, jsonb);
create function public.criar_pedido_venda(
  p_venda_id uuid,
  p_nome text,
  p_telefone text,
  p_quantidade integer,
  p_observacao text,
  p_itens jsonb default '[]'::jsonb,
  p_voucher_hash text default null
)
returns table (
  pedido_id uuid, total_cents integer, pix_chave text, pix_titular text, church_name text, church_address text,
  whatsapp_comprovante text, voucher_codigo text
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
  v_codigo text;
  v_hash text;
begin
  if p_voucher_hash is not null and p_voucher_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Pedido inválido' using errcode = 'P0001';
  end if;
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

  -- Voucher: só quando a venda pede e o servidor mandou o hash do link.
  if v_venda.gera_voucher and p_voucher_hash is not null then
    v_hash := p_voucher_hash;
    v_codigo := public.novo_codigo_voucher(v_venda.id);
  end if;

  insert into public.venda_pedidos (
    venda_id, church_id, nome, telefone, quantidade, preco_unitario_cents, total_cents, observacao,
    voucher_hash, voucher_codigo
  )
  values (
    v_venda.id, v_venda.church_id, v_nome, v_telefone, v_unidades,
    case when v_venda.tem_opcoes then null else v_venda.preco_cents end, v_total, v_obs,
    v_hash, v_codigo
  )
  returning id into v_id;

  insert into public.venda_pedido_itens (pedido_id, venda_id, opcao_id, nome, quantidade, preco_unitario_cents, total_cents)
  select v_id, v_venda.id, t.opcao_id, t.nome, t.quantidade, t.preco, t.quantidade * t.preco
  from pg_temp.itens_do_pedido t;

  return query select v_id, v_total, v_venda.pix_chave, v_venda.pix_titular, v_igreja.name, v_igreja.address,
                      v_venda.whatsapp_comprovante, v_codigo;
end;
$$;

revoke all on function public.criar_pedido_venda(uuid, text, text, integer, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.criar_pedido_venda(uuid, text, text, integer, text, jsonb, text) to service_role;


-- ---------------------------------------------------------------------------
-- Voucher aberto pelo link (sem login): o que quem compra e quem entrega veem
-- ---------------------------------------------------------------------------
-- Só o primeiro nome, os itens e a situação. Telefone e observação ficam no
-- painel.
create or replace function public.voucher_por_token(p_token text)
returns table (
  titulo text, church_name text, primeiro_nome text, codigo text, itens jsonb, total_cents integer,
  pago boolean, cancelado boolean, entregue_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select v.titulo, c.name, split_part(pd.nome, ' ', 1), pd.voucher_codigo,
         coalesce((select jsonb_agg(jsonb_build_object('nome', i.nome, 'quantidade', i.quantidade) order by i.id)
                   from public.venda_pedido_itens i where i.pedido_id = pd.id), '[]'::jsonb),
         pd.total_cents, pd.status = 'pago', pd.status = 'cancelado', pd.entregue_em
  from public.venda_pedidos pd
  join public.vendas v on v.id = pd.venda_id and v.deleted_at is null
  join public.churches c on c.id = v.church_id
  where pd.voucher_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

revoke all on function public.voucher_por_token(text) from public, anon, authenticated;
grant execute on function public.voucher_por_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Entrega (quem cuida de vendas)
-- ---------------------------------------------------------------------------
create or replace function public.marcar_entrega_venda(p_pedido_id uuid, p_entregue boolean, p_obs text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_status text;
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
begin
  select pd.company_id, pd.status into v_company, v_status
  from public.venda_pedidos pd
  join public.vendas v on v.id = pd.venda_id and v.deleted_at is null
  where pd.id = p_pedido_id;
  if v_company is null or not public.tem_acesso(v_company, 'vendas') then
    raise exception 'pedido não encontrado' using errcode = 'P0002';
  end if;
  if p_entregue and v_status = 'cancelado' then
    raise exception 'Pedido cancelado não pode ser entregue' using errcode = 'P0001';
  end if;
  if v_obs is not null and char_length(v_obs) > 300 then
    raise exception 'Observação longa demais' using errcode = 'P0001';
  end if;

  update public.venda_pedidos set
    entregue_em = case when p_entregue then now() end,
    entregue_por = case when p_entregue then auth.uid() end,
    entrega_obs = case when p_entregue then v_obs end,
    atualizado_por = auth.uid(),
    atualizado_em = now()
  where id = p_pedido_id;
end;
$$;

revoke all on function public.marcar_entrega_venda(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.marcar_entrega_venda(uuid, boolean, text) to authenticated;

-- Nome de quem marcou a entrega, para o aviso "já entregue por Fulano".
-- Só para quem cuida das vendas daquela igreja.
create or replace function public.quem_entregou_venda(p_pedido_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(p.full_name, ''), u.email::text)
  from public.venda_pedidos pd
  join auth.users u on u.id = pd.entregue_por
  left join public.profiles p on p.id = pd.entregue_por
  where pd.id = p_pedido_id
    and pd.company_id is not null
    and public.tem_acesso(pd.company_id, 'vendas');
$$;

revoke all on function public.quem_entregou_venda(uuid) from public, anon, authenticated;
grant execute on function public.quem_entregou_venda(uuid) to authenticated;

notify pgrst, 'reload schema';
