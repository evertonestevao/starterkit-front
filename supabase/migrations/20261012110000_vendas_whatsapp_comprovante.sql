-- Vendas: comprovante pelo WhatsApp de quem organiza.
--
-- Opcional, escolhido na criação: com o número preenchido, a tela do Pix
-- ganha o botão "Enviar comprovante", que abre o WhatsApp desse número com
-- uma mensagem pronta (nome, quantidade, total e observação do pedido).
--
-- O número aparece para quem compra, como a chave Pix. Uma conta invadida
-- poderia trocá-lo pelo de um golpista ("manda o comprovante aqui e paga de
-- novo neste outro Pix"). Por isso ele entra na MESMA confirmação do
-- Responsável: trocar o número tira a venda da página até nova confirmação.
-- Gravado só com dígitos (DDD + número, com ou sem o 55).

alter table public.vendas
  add column whatsapp_comprovante text check (whatsapp_comprovante is null or whatsapp_comprovante ~ '^[0-9]{10,13}$');

alter table public.venda_pix_confirmacoes
  add column whatsapp_comprovante text;

-- Trocar chave, titular ou WhatsApp volta para "aguardando confirmação".
create or replace function public.vendas_pix_mudou()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.pix_chave is distinct from old.pix_chave
     or new.pix_titular is distinct from old.pix_titular
     or new.whatsapp_comprovante is distinct from old.whatsapp_comprovante then
    new.pix_confirmado_em := null;
  end if;
  return new;
end;
$$;

revoke all on function public.vendas_pix_mudou() from public, anon, authenticated;

drop trigger vendas_pix_mudou on public.vendas;
create trigger vendas_pix_mudou
  before update of pix_chave, pix_titular, whatsapp_comprovante on public.vendas
  for each row execute function public.vendas_pix_mudou();

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
  v_titulo text := btrim(coalesce(p ->> 'titulo', ''));
  v_descricao text := nullif(btrim(coalesce(p ->> 'descricao', '')), '');
  v_chave text := btrim(coalesce(p ->> 'pix_chave', ''));
  v_titular text := btrim(coalesce(p ->> 'pix_titular', ''));
  v_whats text := nullif(regexp_replace(coalesce(p ->> 'whatsapp_comprovante', ''), '\D', '', 'g'), '');
begin
  select company_id into v_company from public.churches where churches.id = p_church_id and deleted_at is null;
  if v_company is null or not public.tem_acesso(v_company, 'vendas') then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.vendas (
      church_id, titulo, descricao, preco_cents, pix_chave, pix_titular, whatsapp_comprovante,
      encerra_em, estoque, max_por_pedido, criado_por
    )
    values (
      p_church_id, v_titulo, v_descricao, (p ->> 'preco_cents')::integer, v_chave, v_titular, v_whats,
      nullif(p ->> 'encerra_em', '')::date, nullif(p ->> 'estoque', '')::integer,
      nullif(p ->> 'max_por_pedido', '')::integer, auth.uid()
    )
    returning vendas.id into v_id;
    return query select v_id, true;
    return;
  end if;

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
    encerra_em = nullif(p ->> 'encerra_em', '')::date,
    estoque = nullif(p ->> 'estoque', '')::integer,
    max_por_pedido = nullif(p ->> 'max_por_pedido', '')::integer
  where vendas.id = p_id;

  return query
  select p_id, (v_atual.pix_chave is distinct from v_chave or v_atual.pix_titular is distinct from v_titular
                or v_atual.whatsapp_comprovante is distinct from v_whats or v_atual.pix_confirmado_em is null);
end;
$$;

revoke all on function public.salvar_venda(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_venda(uuid, uuid, jsonb) to authenticated;

create or replace function public.venda_pix_criar_confirmacao(
  p_venda_id uuid,
  p_token_hash text,
  p_solicitado_por uuid,
  p_validade_horas integer default 48
)
returns table (email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.vendas%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token inválido' using errcode = '22023';
  end if;

  select * into v_venda from public.vendas where id = p_venda_id and deleted_at is null for update;
  if v_venda.id is null or v_venda.company_id is null or v_venda.pix_confirmado_em is not null then
    raise exception 'não há chave aguardando confirmação' using errcode = 'P0002';
  end if;

  update public.venda_pix_confirmacoes
     set deleted_at = now()
   where venda_id = p_venda_id and usado_em is null and deleted_at is null;

  insert into public.venda_pix_confirmacoes
    (venda_id, company_id, token_hash, pix_chave, pix_titular, whatsapp_comprovante, solicitado_por, expires_at)
  values
    (p_venda_id, v_venda.company_id, p_token_hash, v_venda.pix_chave, v_venda.pix_titular, v_venda.whatsapp_comprovante,
     p_solicitado_por, now() + make_interval(hours => least(greatest(coalesce(p_validade_horas, 48), 1), 168)));

  return query
  select u.email::text
  from public.company_members cm
  join auth.users u on u.id = cm.user_id
  where cm.company_id = v_venda.company_id
    and cm.deleted_at is null
    and cm.role = 'owner'
    and u.email is not null;
end;
$$;

revoke all on function public.venda_pix_criar_confirmacao(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.venda_pix_criar_confirmacao(uuid, text, uuid, integer) to service_role;

-- O link passa a mostrar (e conferir) também o WhatsApp.
drop function public.venda_pix_confirmacao_por_token(text);
create function public.venda_pix_confirmacao_por_token(p_token text)
returns table (
  estado text, church_name text, titulo text, preco_cents integer, pix_chave text, pix_titular text,
  whatsapp_comprovante text
)
language sql
stable
security definer
set search_path = public
as $$
  with pedido as (
    select k.*, c.name as igreja, v.titulo as venda_titulo, v.preco_cents as venda_preco,
           v.pix_chave as chave_atual, v.pix_titular as titular_atual, v.whatsapp_comprovante as whats_atual,
           v.pix_confirmado_em, v.deleted_at as venda_apagada
    from public.venda_pix_confirmacoes k
    join public.vendas v on v.id = k.venda_id
    join public.churches c on c.id = v.church_id
    where k.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  ), avaliado as (
    select p.*,
      case
        when p.usado_em is not null then 'usado'
        when p.deleted_at is not null or p.venda_apagada is not null
          or p.chave_atual is distinct from p.pix_chave or p.titular_atual is distinct from p.pix_titular
          or p.whats_atual is distinct from p.whatsapp_comprovante
          or p.pix_confirmado_em is not null then 'substituido'
        when p.expires_at <= now() then 'expirado'
        else 'valido'
      end as situacao
    from pedido p
  )
  select a.situacao, a.igreja, a.venda_titulo, a.venda_preco,
         case when a.situacao = 'valido' then a.pix_chave end,
         case when a.situacao = 'valido' then a.pix_titular end,
         case when a.situacao = 'valido' then a.whatsapp_comprovante end
  from avaliado a;
$$;

revoke all on function public.venda_pix_confirmacao_por_token(text) from public, anon, authenticated;
grant execute on function public.venda_pix_confirmacao_por_token(text) to anon, authenticated;

create or replace function public.venda_pix_confirmar_por_token(p_token text)
returns table (church_name text, titulo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.venda_pix_confirmacoes%rowtype;
  v_venda public.vendas%rowtype;
  v_igreja text;
begin
  select * into v_pedido
  from public.venda_pix_confirmacoes
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;

  if v_pedido.id is not null then
    select * into v_venda from public.vendas where id = v_pedido.venda_id and deleted_at is null for update;
  end if;

  if v_pedido.id is null or v_venda.id is null
     or v_pedido.usado_em is not null or v_pedido.deleted_at is not null or v_pedido.expires_at <= now()
     or v_venda.pix_chave is distinct from v_pedido.pix_chave
     or v_venda.pix_titular is distinct from v_pedido.pix_titular
     or v_venda.whatsapp_comprovante is distinct from v_pedido.whatsapp_comprovante
     or v_venda.pix_confirmado_em is not null then
    raise exception 'link de confirmação inválido' using errcode = 'P0002';
  end if;

  update public.vendas set pix_confirmado_em = now() where id = v_venda.id;
  update public.venda_pix_confirmacoes set usado_em = now() where id = v_pedido.id;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_pedido.company_id, null, 'venda.pix.confirmado_por_email', 'venda', v_venda.id,
    jsonb_build_object('titulo', v_venda.titulo, 'titular', v_venda.pix_titular,
                       'whatsapp', v_venda.whatsapp_comprovante is not null, 'solicitado_por', v_pedido.solicitado_por)
  );

  select name into v_igreja from public.churches where id = v_venda.church_id;
  return query select v_igreja, v_venda.titulo;
end;
$$;

revoke all on function public.venda_pix_confirmar_por_token(text) from public, anon, authenticated;
grant execute on function public.venda_pix_confirmar_por_token(text) to anon, authenticated;

-- O pedido devolve o WhatsApp do comprovante (null = a venda não pede).
drop function public.criar_pedido_venda(uuid, text, text, integer, text);
create function public.criar_pedido_venda(
  p_venda_id uuid,
  p_nome text,
  p_telefone text,
  p_quantidade integer,
  p_observacao text
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
  v_total integer;
begin
  if char_length(v_nome) not between 2 and 120 then
    raise exception 'Informe seu nome' using errcode = 'P0001';
  end if;
  if char_length(v_telefone) not between 8 and 20 then
    raise exception 'Informe um WhatsApp para contato' using errcode = 'P0001';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 1000 then
    raise exception 'Informe a quantidade' using errcode = 'P0001';
  end if;
  if v_obs is not null and char_length(v_obs) > 500 then
    raise exception 'Observação longa demais' using errcode = 'P0001';
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
  if v_venda.max_por_pedido is not null and p_quantidade > v_venda.max_por_pedido then
    raise exception 'O máximo por pedido é %', v_venda.max_por_pedido using errcode = 'P0001';
  end if;
  v_disponivel := public.venda_disponivel(v_venda);
  if v_disponivel is not null and p_quantidade > v_disponivel then
    if v_disponivel = 0 then
      raise exception 'Esgotado' using errcode = 'P0001';
    end if;
    raise exception 'Só restam % unidade(s)', v_disponivel using errcode = 'P0001';
  end if;

  v_total := v_venda.preco_cents * p_quantidade;
  if v_total > 100000000 then
    raise exception 'Quantidade alta demais' using errcode = 'P0001';
  end if;

  insert into public.venda_pedidos (venda_id, church_id, nome, telefone, quantidade, preco_unitario_cents, total_cents, observacao)
  values (v_venda.id, v_venda.church_id, v_nome, v_telefone, p_quantidade, v_venda.preco_cents, v_total, v_obs)
  returning id into v_id;

  return query select v_id, v_total, v_venda.pix_chave, v_venda.pix_titular, v_igreja.name, v_igreja.address,
                      v_venda.whatsapp_comprovante;
end;
$$;

revoke all on function public.criar_pedido_venda(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.criar_pedido_venda(uuid, text, text, integer, text) to service_role;

notify pgrst, 'reload schema';
