-- Histórico do membro e documentos da secretaria (declaração, carta de
-- recomendação, carta de transferência).
--
-- Histórico: até aqui a situação do membro mudava (ativo, afastado,
-- transferido...) e só ficava o estado atual. Agora cada mudança grava uma
-- linha com data, motivo e quem fez — é o que faz a ficha servir de registro.
-- A secretaria também anota fatos à mão (consagração, disciplina, retorno) e
-- cada documento emitido deixa a sua linha.
--
-- Documentos: o texto é um MODELO com campos entre chaves ({nome}, {igreja}...).
-- A plataforma traz um texto padrão (no código); cada igreja pode gravar o seu,
-- e o modelo vale para as igrejas ABAIXO dela na rede que não tiverem um
-- próprio — a sede escreve a carta uma vez para o ministério inteiro.
--
-- Tudo aqui é do módulo Membros (`tem_acesso(company_id, 'membros')`), só da
-- própria igreja. Modelo só quem administra a igreja altera.

-- "Hoje" no fuso da igreja. O banco roda em UTC: `current_date` vira o dia
-- seguinte às 21h de Brasília, e o histórico sairia com a data de amanhã.
create or replace function public.hoje_local()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- ---------------------------------------------------------------------------
-- 1. Histórico
-- ---------------------------------------------------------------------------
create table public.rol_membro_historico (
  id uuid primary key default gen_random_uuid(),
  -- Em cascata: apagar o membro, a igreja ou a conta leva o histórico junto.
  membro_id uuid not null references public.rol_membros (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  tipo text not null check (tipo in ('cadastro', 'situacao', 'documento', 'anotacao')),
  titulo text not null check (char_length(titulo) between 2 and 160),
  detalhe text check (detalhe is null or char_length(detalhe) <= 500),
  -- Quando o fato aconteceu (pode ser antes de ter sido registrado).
  data date not null default public.hoje_local(),
  registrado_por uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index rol_membro_historico_membro_idx
  on public.rol_membro_historico (membro_id, data desc, created_at desc)
  where deleted_at is null;
create index rol_membro_historico_company_idx on public.rol_membro_historico (company_id);

alter table public.rol_membro_historico enable row level security;

-- Tabela nova nasce com ALL para anon/authenticated: tira tudo e devolve só a
-- leitura. Ninguém escreve direto: registro oficial não se edita pela API.
revoke all on public.rol_membro_historico from public, anon, authenticated;
grant select on public.rol_membro_historico to authenticated;

create policy "rol_membro_historico_select" on public.rol_membro_historico
  for select to authenticated
  using (deleted_at is null and public.tem_acesso(company_id, 'membros'));

create or replace function public.situacao_membro_label(p_situacao text)
returns text
language sql
immutable
as $$
  select case p_situacao
    when 'ativo' then 'Ativo'
    when 'afastado' then 'Afastado'
    when 'transferido' then 'Transferido'
    when 'desligado' then 'Desligado'
    when 'falecido' then 'Falecido'
    else coalesce(p_situacao, '')
  end;
$$;

-- Mudou a situação na ficha: uma linha no histórico.
create or replace function public.rol_membro_fichas_registra_situacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes text;
begin
  if tg_op = 'UPDATE' then
    v_antes := old.situacao;
  else
    -- Primeira ficha: a situação de partida é a do cadastro.
    select case when m.ativo then 'ativo' else 'afastado' end into v_antes
    from public.rol_membros m where m.id = new.membro_id;
    -- Ficha criada já "ativo" não é uma mudança.
    if new.situacao = 'ativo' then return new; end if;
  end if;

  if new.situacao is distinct from v_antes or tg_op = 'INSERT' then
    insert into public.rol_membro_historico
      (membro_id, church_id, company_id, tipo, titulo, detalhe, data, registrado_por)
    values (
      new.membro_id, new.church_id, new.company_id, 'situacao',
      case
        when tg_op = 'UPDATE' then
          'Situação: de ' || public.situacao_membro_label(v_antes) || ' para ' || public.situacao_membro_label(new.situacao)
        else 'Situação: ' || public.situacao_membro_label(new.situacao)
      end,
      new.situacao_motivo,
      coalesce(new.situacao_em, public.hoje_local()),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger rol_membro_fichas_registra_situacao
  after insert or update of situacao on public.rol_membro_fichas
  for each row
  execute function public.rol_membro_fichas_registra_situacao();

-- Entrou no cadastro: a primeira linha do histórico.
create or replace function public.rol_membros_registra_cadastro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is not null then
    insert into public.rol_membro_historico (membro_id, church_id, company_id, tipo, titulo, registrado_por)
    values (new.id, new.church_id, new.company_id, 'cadastro', 'Cadastrado no sistema', auth.uid());
  end if;
  return new;
end;
$$;

create trigger rol_membros_registra_cadastro
  after insert on public.rol_membros
  for each row
  execute function public.rol_membros_registra_cadastro();

revoke all on function public.rol_membro_fichas_registra_situacao() from public, anon, authenticated;
revoke all on function public.rol_membros_registra_cadastro() from public, anon, authenticated;

-- Quem já estava cadastrado ganha o ponto de partida: o cadastro e, se não
-- está ativo, a situação atual (com a data e o motivo que a ficha tiver).
insert into public.rol_membro_historico (membro_id, church_id, company_id, tipo, titulo, data, created_at)
select m.id, m.church_id, m.company_id, 'cadastro', 'Cadastrado no sistema', m.created_at::date, m.created_at
from public.rol_membros m
where m.deleted_at is null and m.company_id is not null;

insert into public.rol_membro_historico (membro_id, church_id, company_id, tipo, titulo, detalhe, data)
select f.membro_id, f.church_id, f.company_id, 'situacao',
       'Situação: ' || public.situacao_membro_label(f.situacao),
       f.situacao_motivo, coalesce(f.situacao_em, f.updated_at::date)
from public.rol_membro_fichas f
join public.rol_membros m on m.id = f.membro_id and m.deleted_at is null
where f.deleted_at is null and f.situacao <> 'ativo';

-- Anotação à mão (consagração, disciplina, retorno...).
create or replace function public.registrar_historico_membro(
  p_membro_id uuid,
  p_titulo text,
  p_detalhe text,
  p_data date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membro public.rol_membros%rowtype;
  v_id uuid;
begin
  select * into v_membro from public.rol_membros where id = p_membro_id and deleted_at is null;
  -- Mesma resposta para "não existe" e "não é da sua igreja".
  if v_membro.id is null or v_membro.company_id is null or not public.tem_acesso(v_membro.company_id, 'membros') then
    raise exception 'membro não encontrado' using errcode = 'P0002';
  end if;
  if p_data is not null and p_data > public.hoje_local() then
    raise exception 'a data não pode ser no futuro' using errcode = '22023';
  end if;

  insert into public.rol_membro_historico (membro_id, church_id, company_id, tipo, titulo, detalhe, data, registrado_por)
  values (
    v_membro.id, v_membro.church_id, v_membro.company_id, 'anotacao',
    btrim(coalesce(p_titulo, '')), nullif(btrim(coalesce(p_detalhe, '')), ''),
    coalesce(p_data, public.hoje_local()), auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Só a anotação feita à mão pode ser retirada (erro de digitação). O que o
-- sistema registrou — cadastro, situação, documento — fica.
create or replace function public.excluir_historico_membro(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linha public.rol_membro_historico%rowtype;
begin
  select * into v_linha from public.rol_membro_historico where id = p_id and deleted_at is null for update;
  if v_linha.id is null or not public.tem_acesso(v_linha.company_id, 'membros') then
    raise exception 'registro não encontrado' using errcode = 'P0002';
  end if;
  if v_linha.tipo <> 'anotacao' then
    raise exception 'este registro não pode ser excluído' using errcode = '42501';
  end if;
  update public.rol_membro_historico set deleted_at = now() where id = p_id;
end;
$$;

-- Documento emitido: fica no histórico do membro.
create or replace function public.registrar_documento_emitido(p_membro_id uuid, p_tipo text, p_destino text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membro public.rol_membros%rowtype;
  v_destino text := nullif(left(btrim(coalesce(p_destino, '')), 160), '');
begin
  select * into v_membro from public.rol_membros where id = p_membro_id and deleted_at is null;
  if v_membro.id is null or v_membro.company_id is null or not public.tem_acesso(v_membro.company_id, 'membros') then
    raise exception 'membro não encontrado' using errcode = 'P0002';
  end if;
  if p_tipo not in ('declaracao', 'recomendacao', 'transferencia') then
    raise exception 'documento desconhecido' using errcode = '22023';
  end if;

  insert into public.rol_membro_historico (membro_id, church_id, company_id, tipo, titulo, detalhe, registrado_por)
  values (
    v_membro.id, v_membro.church_id, v_membro.company_id, 'documento',
    case p_tipo
      when 'declaracao' then 'Declaração de membro emitida'
      when 'recomendacao' then 'Carta de recomendação emitida'
      else 'Carta de transferência emitida'
    end,
    case when v_destino is null then null else 'Para: ' || v_destino end,
    auth.uid()
  );
end;
$$;

revoke all on function public.registrar_historico_membro(uuid, text, text, date) from public, anon, authenticated;
revoke all on function public.excluir_historico_membro(uuid) from public, anon, authenticated;
revoke all on function public.registrar_documento_emitido(uuid, text, text) from public, anon, authenticated;
grant execute on function public.registrar_historico_membro(uuid, text, text, date) to authenticated;
grant execute on function public.excluir_historico_membro(uuid) to authenticated;
grant execute on function public.registrar_documento_emitido(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Modelos de documento
-- ---------------------------------------------------------------------------
create table public.documento_modelos (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  tipo text not null check (tipo in ('declaracao', 'recomendacao', 'transferencia')),
  titulo text not null check (char_length(titulo) between 3 and 120),
  corpo text not null check (char_length(corpo) between 20 and 4000),
  atualizado_por uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um modelo vigente por igreja e documento.
create unique index documento_modelos_igreja_tipo_idx
  on public.documento_modelos (church_id, tipo)
  where deleted_at is null;
create index documento_modelos_company_idx on public.documento_modelos (company_id);

alter table public.documento_modelos enable row level security;

revoke all on public.documento_modelos from public, anon, authenticated;
grant select on public.documento_modelos to authenticated;

-- Direto na tabela só o modelo da PRÓPRIA igreja; o herdado da igreja de cima
-- sai pela função `documento_modelos_vigentes`.
create policy "documento_modelos_select" on public.documento_modelos
  for select to authenticated
  using (deleted_at is null and public.tem_acesso(company_id, 'membros'));

create or replace function public.salvar_documento_modelo(p_church_id uuid, p_tipo text, p_titulo text, p_corpo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.churches where id = p_church_id and deleted_at is null;
  if v_company is null or not public.is_company_admin(v_company) then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;

  update public.documento_modelos
     set titulo = btrim(p_titulo), corpo = btrim(p_corpo), atualizado_por = auth.uid(), updated_at = now()
   where church_id = p_church_id and tipo = p_tipo and deleted_at is null;
  if not found then
    insert into public.documento_modelos (church_id, company_id, tipo, titulo, corpo, atualizado_por)
    values (p_church_id, v_company, p_tipo, btrim(p_titulo), btrim(p_corpo), auth.uid());
  end if;
end;
$$;

-- Voltar ao modelo herdado (da igreja de cima) ou ao padrão da plataforma.
create or replace function public.restaurar_documento_modelo(p_church_id uuid, p_tipo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.churches where id = p_church_id and deleted_at is null;
  if v_company is null or not public.is_company_admin(v_company) then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;
  update public.documento_modelos
     set deleted_at = now(), atualizado_por = auth.uid(), updated_at = now()
   where church_id = p_church_id and tipo = p_tipo and deleted_at is null;
end;
$$;

-- O modelo que VALE para a igreja, por documento: o dela, ou o da igreja mais
-- próxima acima na rede. Sem linha = vale o padrão da plataforma (no código).
create or replace function public.documento_modelos_vigentes(p_church_id uuid)
returns table (tipo text, titulo text, corpo text, origem_church_id uuid, origem_nome text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (dm.tipo) dm.tipo, dm.titulo, dm.corpo, acima.id, acima.name
  from public.churches c
  join public.churches acima on c.path <@ acima.path and acima.deleted_at is null
  join public.documento_modelos dm on dm.church_id = acima.id and dm.deleted_at is null
  where c.id = p_church_id
    and c.deleted_at is null
    and c.company_id is not null
    and public.tem_acesso(c.company_id, 'membros')
  order by dm.tipo, nlevel(acima.path) desc;
$$;

-- O que o documento precisa saber da igreja, inclusive quem assina (o Pastor).
-- Separado de `pastores_das_igrejas`, que só responde a quem administra: quem
-- emite documento é a secretaria, com o módulo Membros.
create or replace function public.documento_dados_da_igreja(p_church_id uuid)
returns table (nome text, sobrenome text, endereco text, saudacao text, pastor text)
language sql
stable
security definer
set search_path = public
as $$
  select c.name, c.sobrenome, c.address, c.saudacao,
         (select m.nome
            from public.rol_membro_cargos rc
            join public.cargos cg on cg.id = rc.cargo_id and cg.slug = 'pastor'
            join public.rol_membros m on m.id = rc.membro_id and m.deleted_at is null and m.ativo
           where rc.church_id = c.id
           order by rc.desde desc
           limit 1)
  from public.churches c
  where c.id = p_church_id
    and c.deleted_at is null
    and c.company_id is not null
    and public.tem_acesso(c.company_id, 'membros');
$$;

revoke all on function public.salvar_documento_modelo(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.restaurar_documento_modelo(uuid, text) from public, anon, authenticated;
revoke all on function public.documento_modelos_vigentes(uuid) from public, anon, authenticated;
revoke all on function public.documento_dados_da_igreja(uuid) from public, anon, authenticated;
grant execute on function public.salvar_documento_modelo(uuid, text, text, text) to authenticated;
grant execute on function public.restaurar_documento_modelo(uuid, text) to authenticated;
grant execute on function public.documento_modelos_vigentes(uuid) to authenticated;
grant execute on function public.documento_dados_da_igreja(uuid) to authenticated;

notify pgrst, 'reload schema';
