-- Vendas: camiseta do congresso, pastel, lanche... vendidos antes, pela
-- página da igreja.
--
-- Quem organiza cria a venda com preço fixo e a chave Pix de quem recebe. Não
-- é dinheiro da igreja: não entra na Tesouraria nem no caixa. Quem compra
-- escolhe a quantidade (o total é calculado), deixa nome, WhatsApp e uma
-- observação livre ("2 G e 1 M"), e recebe o Pix com o valor já embutido. A
-- confirmação do pagamento é manual, no painel.
--
-- A chave Pix é o ponto sensível: ela vai para a página pública, e uma conta
-- invadida poderia criar uma "venda" com o Pix de um golpista. Por isso segue
-- a mesma regra da chave da igreja (migration 20261007100000): a venda só
-- aparece na página depois que o Responsável (owner) confirma a chave pelo
-- link enviado ao e-mail dele. Trocar a chave ou o titular volta a venda para
-- "aguardando confirmação".
--
-- Quem cuida: quem administra a igreja ou tem um cargo com o módulo "vendas"
-- liberado (Configurações → Acessos). Como os outros módulos, a igreja pode
-- desligá-lo inteiro.

-- ---------------------------------------------------------------------------
-- 1. O módulo entra na lista dos liberáveis por cargo e dos desligáveis
-- ---------------------------------------------------------------------------
alter table public.cargo_acessos drop constraint cargo_acessos_modulo_check;
alter table public.cargo_acessos add constraint cargo_acessos_modulo_check check (
  modulo in ('dashboard', 'acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns', 'relationships',
             'tesouraria', 'vendas')
);

alter table public.cargos drop constraint cargos_acessos_padrao_check;
alter table public.cargos add constraint cargos_acessos_padrao_check check (
  acessos_padrao <@ array['dashboard', 'acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns',
                          'relationships', 'tesouraria', 'vendas']
);

create or replace function public.meus_acessos()
returns table (company_id uuid, modulo text)
language sql
stable
security definer
set search_path = public
as $$
  select cm.company_id, mod.modulo
  from public.company_members cm
  cross join unnest(array['dashboard', 'acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns',
                          'relationships', 'tesouraria', 'vendas'])
    as mod(modulo)
  where cm.user_id = auth.uid()
    and cm.deleted_at is null
    and public.tem_acesso_por_cargo(cm.company_id, mod.modulo);
$$;

alter table public.church_modulos drop constraint church_modulos_modulo_check;
alter table public.church_modulos add constraint church_modulos_modulo_check check (
  modulo in ('acompanhamento', 'ebd', 'programacao', 'events', 'campaigns', 'relationships', 'tesouraria', 'vendas')
);

create or replace function public.salvar_modulos_ativos(p_company_id uuid, p_itens jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church uuid;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'apenas quem administra altera os módulos' using errcode = '42501';
  end if;

  -- A igreja mais alta da empresa (ver migration 20261010100000).
  select id into v_church
  from public.churches
  where company_id = p_company_id and deleted_at is null
  order by nlevel(path), created_at, id
  limit 1;
  if v_church is null then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) > 50 then
    raise exception 'lista de módulos inválida' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_itens) as i(modulo text, ativo boolean)
    where i.modulo not in (
      'acompanhamento', 'ebd', 'programacao', 'events', 'campaigns', 'relationships', 'tesouraria', 'vendas'
    )
  ) then
    raise exception 'módulo inválido' using errcode = '22023';
  end if;

  delete from public.church_modulos where church_id = v_church;

  insert into public.church_modulos (church_id, modulo, ativo, updated_by)
  select v_church, i.modulo, i.ativo, auth.uid()
  from jsonb_to_recordset(p_itens) as i(modulo text, ativo boolean)
  where i.modulo is not null and i.ativo is not null;
end;
$$;

revoke all on function public.salvar_modulos_ativos(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_modulos_ativos(uuid, jsonb) to authenticated;

create or replace function public.modulos_ativos()
returns table (company_id uuid, modulo text)
language sql
stable
security definer
set search_path = public
as $$
  select cm.company_id, mod.modulo
  from public.company_members cm
  cross join unnest(array[
    'acompanhamento', 'ebd', 'programacao', 'events', 'campaigns', 'relationships', 'tesouraria', 'vendas'
  ]) as mod(modulo)
  where cm.user_id = auth.uid()
    and cm.deleted_at is null
    and public.modulo_ativo(cm.company_id, mod.modulo);
$$;

revoke all on function public.modulos_ativos() from public, anon, authenticated;
grant execute on function public.modulos_ativos() to authenticated;

create or replace function public.create_company_with_church(
  p_name text,
  p_slug text,
  p_sobrenome text default null,
  p_faz_parte_de_rede boolean default false,
  p_rede_nome text default null,
  p_modulos_inativos text[] default '{}'
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies;
  v_church_slug text;
  v_church_id uuid;
  v_sobrenome text := nullif(btrim(coalesce(p_sobrenome, '')), '');
  v_faz_parte boolean := coalesce(p_faz_parte_de_rede, false);
  v_rede text := nullif(btrim(coalesce(p_rede_nome, '')), '');
begin
  if v_sobrenome is not null and char_length(v_sobrenome) > 120 then
    raise exception 'complemento do nome muito longo' using errcode = '23514';
  end if;
  if v_rede is not null and char_length(v_rede) > 120 then
    raise exception 'nome da rede muito longo' using errcode = '23514';
  end if;
  if not v_faz_parte then
    v_rede := null;
  end if;

  insert into public.companies (name, slug, created_by)
  values (p_name, p_slug, auth.uid())
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company.id, auth.uid(), 'owner');

  v_church_slug := public.next_available_church_slug(p_slug);

  insert into public.churches (
    company_id, name, sobrenome, slug, public_code, path, faz_parte_de_rede, rede_nome
  )
  values (
    v_company.id, p_name, v_sobrenome, v_church_slug, v_church_slug, v_church_slug::ltree,
    v_faz_parte, v_rede
  )
  returning id into v_church_id;

  if p_modulos_inativos is not null and array_length(p_modulos_inativos, 1) > 0 then
    insert into public.church_modulos (church_id, modulo, ativo, updated_by)
    select v_church_id, m, false, auth.uid()
    from unnest(p_modulos_inativos) as m
    where m in ('acompanhamento', 'ebd', 'programacao', 'events', 'campaigns', 'relationships', 'tesouraria', 'vendas');
  end if;

  return v_company;
end;
$$;

revoke all on function public.create_company_with_church(text, text, text, boolean, text, text[]) from public, anon, authenticated;
grant execute on function public.create_company_with_church(text, text, text, boolean, text, text[]) to authenticated;

-- "vendas" vira subpágina da igreja (/igreja/{codigo}/vendas) e deixa de
-- poder ser código de igreja. Nenhuma igreja usa esse código hoje.
alter table public.churches drop constraint churches_codigo_formato;
alter table public.churches add constraint churches_codigo_formato check (
  codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  and char_length(codigo) between 3 and 40
  and codigo not in ('eventos', 'campanhas', 'igrejas', 'vendas')
);

-- ---------------------------------------------------------------------------
-- 2. Vendas
-- ---------------------------------------------------------------------------
create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 2 and 120),
  descricao text check (descricao is null or char_length(descricao) <= 2000),
  preco_cents integer not null check (preco_cents > 0 and preco_cents <= 10000000),
  -- Quem recebe. Só vai para a página depois de confirmada pelo Responsável.
  pix_chave text not null check (char_length(pix_chave) between 5 and 140),
  pix_titular text not null check (char_length(pix_titular) between 3 and 140),
  pix_confirmado_em timestamptz,
  -- Limites, todos opcionais. A data fecha no fim do dia (horário de Brasília).
  encerra_em date,
  estoque integer check (estoque is null or estoque between 1 and 100000),
  max_por_pedido integer check (max_por_pedido is null or max_por_pedido between 1 and 1000),
  -- `ativa` só aparece com a chave confirmada; `encerrada` não aceita pedido.
  status text not null default 'ativa' check (status in ('ativa', 'encerrada')),
  criado_por uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendas_church_idx on public.vendas (church_id, created_at desc) where deleted_at is null;

create trigger set_vendas_company_id
  before insert or update of church_id on public.vendas
  for each row execute function public.set_company_id_from_church();

create trigger set_vendas_updated_at
  before update on public.vendas
  for each row execute function public.set_updated_at();

-- Trocar a chave ou o titular volta para "aguardando confirmação" — vale
-- para qualquer caminho de escrita, não só para a função de salvar.
create or replace function public.vendas_pix_mudou()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.pix_chave is distinct from old.pix_chave or new.pix_titular is distinct from old.pix_titular then
    new.pix_confirmado_em := null;
  end if;
  return new;
end;
$$;

revoke all on function public.vendas_pix_mudou() from public, anon, authenticated;

create trigger vendas_pix_mudou
  before update of pix_chave, pix_titular on public.vendas
  for each row execute function public.vendas_pix_mudou();

alter table public.vendas enable row level security;
-- Nasce com ALL para anon/authenticated: tira tudo. Ler é só para quem cuida
-- de vendas; escrever é só pelas funções abaixo. A página pública lê pelas
-- funções de leitura pública, que nunca devolvem venda com chave não confirmada.
revoke all on public.vendas from anon, authenticated;
grant select on public.vendas to authenticated;

create policy vendas_select_quem_cuida on public.vendas
  for select to authenticated
  using (deleted_at is null and company_id is not null and public.tem_acesso(company_id, 'vendas'));

-- ---------------------------------------------------------------------------
-- 3. Pedidos
-- ---------------------------------------------------------------------------
create table public.venda_pedidos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 120),
  telefone text not null check (char_length(telefone) between 8 and 20),
  quantidade integer not null check (quantidade between 1 and 1000),
  -- O preço do momento do pedido: mudar o preço depois não muda o que já foi pedido.
  preco_unitario_cents integer not null check (preco_unitario_cents > 0),
  total_cents integer not null check (total_cents > 0),
  observacao text check (observacao is null or char_length(observacao) <= 500),
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'cancelado')),
  atualizado_por uuid references auth.users (id) on delete set null,
  atualizado_em timestamptz,
  created_at timestamptz not null default now()
);

create index venda_pedidos_venda_idx on public.venda_pedidos (venda_id, created_at desc);

create trigger set_venda_pedidos_company_id
  before insert or update of church_id on public.venda_pedidos
  for each row execute function public.set_company_id_from_church();

alter table public.venda_pedidos enable row level security;
-- Nome e telefone de quem compra: só quem cuida de vendas lê. Ninguém grava
-- direto: o pedido entra pelo servidor (service_role) e muda de situação pela
-- função de marcar.
revoke all on public.venda_pedidos from anon, authenticated;
grant select on public.venda_pedidos to authenticated;

create policy venda_pedidos_select_quem_cuida on public.venda_pedidos
  for select to authenticated
  using (company_id is not null and public.tem_acesso(company_id, 'vendas'));

-- ---------------------------------------------------------------------------
-- 4. Confirmação da chave pelo Responsável (mesmo desenho do Pix da igreja)
-- ---------------------------------------------------------------------------
create table public.venda_pix_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  token_hash text not null unique,
  -- A chave que ESTE link confirma: se a venda trocar depois, o link morre.
  pix_chave text not null,
  pix_titular text not null,
  solicitado_por uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  usado_em timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index venda_pix_confirmacoes_venda_idx on public.venda_pix_confirmacoes (venda_id);

alter table public.venda_pix_confirmacoes enable row level security;
revoke all on table public.venda_pix_confirmacoes from public, anon, authenticated;

create policy venda_pix_confirmacoes_ninguem on public.venda_pix_confirmacoes
  for all to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 5. Painel: salvar, encerrar/reabrir, excluir, marcar pedido
-- ---------------------------------------------------------------------------
-- Novo (p_id nulo) ou edição. Devolve o id e se a chave precisa de confirmação
-- (venda nova, ou chave/titular trocados).
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
begin
  select company_id into v_company from public.churches where churches.id = p_church_id and deleted_at is null;
  if v_company is null or not public.tem_acesso(v_company, 'vendas') then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.vendas (
      church_id, titulo, descricao, preco_cents, pix_chave, pix_titular, encerra_em, estoque, max_por_pedido, criado_por
    )
    values (
      p_church_id, v_titulo, v_descricao, (p ->> 'preco_cents')::integer, v_chave, v_titular,
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
    encerra_em = nullif(p ->> 'encerra_em', '')::date,
    estoque = nullif(p ->> 'estoque', '')::integer,
    max_por_pedido = nullif(p ->> 'max_por_pedido', '')::integer
  where vendas.id = p_id;

  return query
  select p_id, (v_atual.pix_chave is distinct from v_chave or v_atual.pix_titular is distinct from v_titular
                or v_atual.pix_confirmado_em is null);
end;
$$;

revoke all on function public.salvar_venda(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_venda(uuid, uuid, jsonb) to authenticated;

create or replace function public.definir_status_venda(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if p_status not in ('ativa', 'encerrada') then
    raise exception 'situação inválida' using errcode = '22023';
  end if;
  select company_id into v_company from public.vendas where id = p_id and deleted_at is null;
  if v_company is null or not public.tem_acesso(v_company, 'vendas') then
    raise exception 'venda não encontrada' using errcode = 'P0002';
  end if;
  update public.vendas set status = p_status where id = p_id;
end;
$$;

revoke all on function public.definir_status_venda(uuid, text) from public, anon, authenticated;
grant execute on function public.definir_status_venda(uuid, text) to authenticated;

create or replace function public.excluir_venda(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.vendas where id = p_id and deleted_at is null;
  if v_company is null or not public.tem_acesso(v_company, 'vendas') then
    raise exception 'venda não encontrada' using errcode = 'P0002';
  end if;
  update public.vendas set deleted_at = now() where id = p_id;
  -- Links de confirmação pendentes deixam de valer.
  update public.venda_pix_confirmacoes set deleted_at = now()
  where venda_id = p_id and usado_em is null and deleted_at is null;
end;
$$;

revoke all on function public.excluir_venda(uuid) from public, anon, authenticated;
grant execute on function public.excluir_venda(uuid) to authenticated;

create or replace function public.marcar_pedido_venda(p_pedido_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if p_status not in ('pendente', 'pago', 'cancelado') then
    raise exception 'situação inválida' using errcode = '22023';
  end if;
  select pd.company_id into v_company
  from public.venda_pedidos pd
  join public.vendas v on v.id = pd.venda_id and v.deleted_at is null
  where pd.id = p_pedido_id;
  if v_company is null or not public.tem_acesso(v_company, 'vendas') then
    raise exception 'pedido não encontrado' using errcode = 'P0002';
  end if;
  update public.venda_pedidos
  set status = p_status, atualizado_por = auth.uid(), atualizado_em = now()
  where id = p_pedido_id;
end;
$$;

revoke all on function public.marcar_pedido_venda(uuid, text) from public, anon, authenticated;
grant execute on function public.marcar_pedido_venda(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Confirmação da chave (criar: só servidor; abrir e confirmar: pelo link)
-- ---------------------------------------------------------------------------
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

  -- Um link válido por vez: o anterior deixa de funcionar.
  update public.venda_pix_confirmacoes
     set deleted_at = now()
   where venda_id = p_venda_id and usado_em is null and deleted_at is null;

  insert into public.venda_pix_confirmacoes
    (venda_id, company_id, token_hash, pix_chave, pix_titular, solicitado_por, expires_at)
  values
    (p_venda_id, v_venda.company_id, p_token_hash, v_venda.pix_chave, v_venda.pix_titular, p_solicitado_por,
     now() + make_interval(hours => least(greatest(coalesce(p_validade_horas, 48), 1), 168)));

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

create or replace function public.venda_pix_confirmacao_por_token(p_token text)
returns table (estado text, church_name text, titulo text, preco_cents integer, pix_chave text, pix_titular text)
language sql
stable
security definer
set search_path = public
as $$
  with pedido as (
    select k.*, c.name as igreja, v.titulo as venda_titulo, v.preco_cents as venda_preco,
           v.pix_chave as chave_atual, v.pix_titular as titular_atual,
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
          or p.pix_confirmado_em is not null then 'substituido'
        when p.expires_at <= now() then 'expirado'
        else 'valido'
      end as situacao
    from pedido p
  )
  -- A chave só é devolvida enquanto o link vale.
  select a.situacao, a.igreja, a.venda_titulo, a.venda_preco,
         case when a.situacao = 'valido' then a.pix_chave end,
         case when a.situacao = 'valido' then a.pix_titular end
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
     or v_venda.pix_confirmado_em is not null then
    raise exception 'link de confirmação inválido' using errcode = 'P0002';
  end if;

  update public.vendas set pix_confirmado_em = now() where id = v_venda.id;
  update public.venda_pix_confirmacoes set usado_em = now() where id = v_pedido.id;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_pedido.company_id, null, 'venda.pix.confirmado_por_email', 'venda', v_venda.id,
    jsonb_build_object('titulo', v_venda.titulo, 'titular', v_venda.pix_titular, 'solicitado_por', v_pedido.solicitado_por)
  );

  select name into v_igreja from public.churches where id = v_venda.church_id;
  return query select v_igreja, v_venda.titulo;
end;
$$;

revoke all on function public.venda_pix_confirmar_por_token(text) from public, anon, authenticated;
grant execute on function public.venda_pix_confirmar_por_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Página pública: leitura e pedido
-- ---------------------------------------------------------------------------
-- Uma venda está aberta quando: ativa, com a chave confirmada, antes do fim do
-- dia de encerramento, e com estoque (se houver). A página da igreja precisa
-- estar no ar, como para o resto do conteúdo dela.
create or replace function public.venda_disponivel(p_venda public.vendas)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  -- Quantas unidades ainda dá para pedir (null = sem limite de estoque).
  select case when p_venda.estoque is null then null
              else greatest(p_venda.estoque - coalesce((
                select sum(quantidade)::integer from public.venda_pedidos
                where venda_id = p_venda.id and status <> 'cancelado'
              ), 0), 0)
         end;
$$;

revoke all on function public.venda_disponivel(public.vendas) from public, anon, authenticated;

-- Vendas abertas de uma igreja, sem a chave Pix (ela só sai junto do pedido).
create or replace function public.vendas_publicas(p_church_id uuid)
returns table (
  id uuid, titulo text, descricao text, preco_cents integer, encerra_em date,
  max_por_pedido integer, disponivel integer
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.titulo, v.descricao, v.preco_cents, v.encerra_em, v.max_por_pedido,
         public.venda_disponivel(v)
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

-- Pedido vindo da página. Só o servidor chama (limite de envios e barreira
-- contra robôs ficam lá). Confere tudo de novo com a venda travada, para dois
-- pedidos ao mesmo tempo não passarem do estoque.
create or replace function public.criar_pedido_venda(
  p_venda_id uuid,
  p_nome text,
  p_telefone text,
  p_quantidade integer,
  p_observacao text
)
returns table (pedido_id uuid, total_cents integer, pix_chave text, pix_titular text, church_name text, church_address text)
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

  return query select v_id, v_total, v_venda.pix_chave, v_venda.pix_titular, v_igreja.name, v_igreja.address;
end;
$$;

revoke all on function public.criar_pedido_venda(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.criar_pedido_venda(uuid, text, text, integer, text) to service_role;

notify pgrst, 'reload schema';
