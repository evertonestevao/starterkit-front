-- Modelo da carteirinha: aparência e informações escolhidas pela igreja.
--
-- Quem define é a igreja do TOPO da rede — a sede, ou a igreja independente
-- (sem igreja acima). O modelo vale para a rede inteira: a carteirinha do
-- ministério é uma só, e uma congregação não muda a cor por conta própria.
--
-- O que se escolhe: um dos desenhos prontos, duas cores, um título, se a logo
-- da igreja aparece, quais informações do membro aparecem (cargos, membro
-- desde, batismo, nascimento, estado civil) e dois textos livres (rodapé e
-- verso). A logo é a da igreja do membro; sem ela, a da igreja do topo.
--
-- Sem modelo gravado, vale o padrão da plataforma (no código).
--
-- Dado a mais só sai do banco se o modelo pedir: quem abre a carteirinha pelo
-- link não recebe a data de nascimento se a igreja não a colocou no cartão.

create table public.carteirinha_modelos (
  -- Uma linha por rede: a igreja do topo.
  church_id uuid primary key references public.churches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  layout text not null default 'classico' check (layout in ('classico', 'lateral', 'minimalista')),
  cor_primaria text not null check (cor_primaria ~ '^#[0-9a-f]{6}$'),
  cor_destaque text not null check (cor_destaque ~ '^#[0-9a-f]{6}$'),
  titulo text check (titulo is null or char_length(titulo) between 2 and 40),
  mostrar_logo boolean not null default true,
  campos text[] not null default '{}'
    check (campos <@ array['cargos', 'membro_desde', 'batismo', 'nascimento', 'estado_civil']),
  rodape text check (rodape is null or char_length(rodape) <= 80),
  texto_verso text check (texto_verso is null or char_length(texto_verso) <= 160),
  atualizado_por uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index carteirinha_modelos_company_idx on public.carteirinha_modelos (company_id);

alter table public.carteirinha_modelos enable row level security;

-- Tabela nova nasce com ALL para anon/authenticated: tira tudo e devolve só a
-- leitura. Direto na tabela só o modelo da PRÓPRIA igreja; o da sede chega às
-- igrejas de baixo pela função `carteirinha_modelo_vigente`.
revoke all on public.carteirinha_modelos from public, anon, authenticated;
grant select on public.carteirinha_modelos to authenticated;

create policy "carteirinha_modelos_select" on public.carteirinha_modelos
  for select to authenticated
  using (deleted_at is null and public.tem_acesso(company_id, 'membros'));

-- ---------------------------------------------------------------------------
-- 1. Qual modelo vale, e quem pode mudar
-- ---------------------------------------------------------------------------
-- Uma linha sempre que a igreja existe e quem pergunta tem o módulo Membros
-- dela: a igreja do topo da rede, se quem pergunta pode editar, e o modelo
-- (colunas nulas quando ainda vale o padrão da plataforma).
create or replace function public.carteirinha_modelo_vigente(p_church_id uuid)
returns table (
  origem_church_id uuid,
  origem_nome text,
  pode_editar boolean,
  layout text,
  cor_primaria text,
  cor_destaque text,
  titulo text,
  campos text[],
  rodape text,
  texto_verso text,
  mostrar_logo boolean,
  logo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select topo.id, topo.name,
         -- Só quem administra a própria igreja do topo.
         topo.id = c.id and public.is_company_admin(c.company_id),
         cm.layout, cm.cor_primaria, cm.cor_destaque, cm.titulo, cm.campos, cm.rodape, cm.texto_verso,
         cm.mostrar_logo,
         -- A logo da própria igreja; sem ela, a da igreja do topo.
         coalesce(c.logo_url, topo.logo_url)
  from public.churches c
  join public.churches topo on c.path <@ topo.path and topo.parent_id is null and topo.deleted_at is null
  left join public.carteirinha_modelos cm on cm.church_id = topo.id and cm.deleted_at is null
  where c.id = p_church_id
    and c.deleted_at is null
    and c.company_id is not null
    and public.tem_acesso(c.company_id, 'membros');
$$;

-- Só a igreja do topo da rede (sede ou independente), e só quem a administra.
create or replace function public.salvar_carteirinha_modelo(p_church_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_igreja public.churches%rowtype;
  v_campos text[];
begin
  select * into v_igreja from public.churches where id = p_church_id and deleted_at is null;
  -- Mesma resposta para "não existe" e "não é sua".
  if v_igreja.id is null or v_igreja.company_id is null or not public.is_company_admin(v_igreja.company_id) then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;
  if v_igreja.parent_id is not null then
    raise exception 'o modelo da carteirinha é definido pela sede da rede' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct valor), '{}') into v_campos
  from jsonb_array_elements_text(coalesce(p -> 'campos', '[]'::jsonb)) as t(valor);

  insert into public.carteirinha_modelos as cm
    (church_id, company_id, layout, cor_primaria, cor_destaque, titulo, mostrar_logo, campos, rodape, texto_verso,
     atualizado_por)
  values (
    p_church_id, v_igreja.company_id,
    coalesce(nullif(p ->> 'layout', ''), 'classico'),
    lower(p ->> 'cor_primaria'),
    lower(p ->> 'cor_destaque'),
    nullif(btrim(coalesce(p ->> 'titulo', '')), ''),
    coalesce((p ->> 'mostrar_logo')::boolean, true),
    v_campos,
    nullif(btrim(coalesce(p ->> 'rodape', '')), ''),
    nullif(btrim(coalesce(p ->> 'texto_verso', '')), ''),
    auth.uid()
  )
  on conflict (church_id) do update set
    layout = excluded.layout,
    cor_primaria = excluded.cor_primaria,
    cor_destaque = excluded.cor_destaque,
    titulo = excluded.titulo,
    mostrar_logo = excluded.mostrar_logo,
    campos = excluded.campos,
    rodape = excluded.rodape,
    texto_verso = excluded.texto_verso,
    atualizado_por = excluded.atualizado_por,
    deleted_at = null,
    updated_at = now();
end;
$$;

-- Voltar ao padrão da plataforma.
create or replace function public.restaurar_carteirinha_modelo(p_church_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_igreja public.churches%rowtype;
begin
  select * into v_igreja from public.churches where id = p_church_id and deleted_at is null;
  if v_igreja.id is null or v_igreja.company_id is null or not public.is_company_admin(v_igreja.company_id) then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;
  if v_igreja.parent_id is not null then
    raise exception 'o modelo da carteirinha é definido pela sede da rede' using errcode = '42501';
  end if;
  update public.carteirinha_modelos
     set deleted_at = now(), atualizado_por = auth.uid(), updated_at = now()
   where church_id = p_church_id and deleted_at is null;
end;
$$;

revoke all on function public.carteirinha_modelo_vigente(uuid) from public, anon, authenticated;
revoke all on function public.salvar_carteirinha_modelo(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.restaurar_carteirinha_modelo(uuid) from public, anon, authenticated;
grant execute on function public.carteirinha_modelo_vigente(uuid) to authenticated;
grant execute on function public.salvar_carteirinha_modelo(uuid, jsonb) to authenticated;
grant execute on function public.restaurar_carteirinha_modelo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A carteirinha passa a levar o modelo e as informações que ele pede
-- ---------------------------------------------------------------------------
-- As três funções mudam de retorno: saem e voltam.
drop function public.carteirinha_por_token(text);
drop function public.carteirinha_do_membro(uuid);
drop function public.carteirinha_dados(uuid);

-- Função interna (sem GRANT). `modelo` é nulo quando vale o padrão. Batismo,
-- nascimento, estado civil e a logo só saem se o modelo da rede os mostra.
create function public.carteirinha_dados(p_membro_id uuid)
returns table (
  membro_id uuid,
  nome text,
  cargos text,
  igreja text,
  igreja_sobrenome text,
  pastor text,
  membro_desde date,
  batismo date,
  nascimento date,
  estado_civil text,
  validade date,
  codigo text,
  estado text,
  foto_path text,
  modelo jsonb,
  logo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id, m.nome,
    (select string_agg(cg.nome, ', ' order by cg.ordem, cg.nome)
       from public.rol_membro_cargos rc
       join public.cargos cg on cg.id = rc.cargo_id and cg.deleted_at is null
      where rc.membro_id = m.id),
    c.name, c.sobrenome,
    (select p.nome
       from public.rol_membro_cargos rc
       join public.cargos cg on cg.id = rc.cargo_id and cg.slug = 'pastor'
       join public.rol_membros p on p.id = rc.membro_id and p.deleted_at is null and p.ativo
      where rc.church_id = c.id
      order by rc.desde desc
      limit 1),
    f.membro_desde,
    case when 'batismo' = any (cm.campos) then m.batismo end,
    case when 'nascimento' = any (cm.campos) then m.nascimento end,
    case when 'estado_civil' = any (cm.campos) then f.estado_civil end,
    k.validade, k.codigo,
    case
      when k.revogada_em is not null or not coalesce(s.carteirinha, false) then 'cancelada'
      when not m.ativo then 'inativa'
      when k.validade < public.hoje_local() then 'vencida'
      else 'valida'
    end,
    case when coalesce(s.foto, false) then s.foto_path end,
    case when cm.church_id is null then null else jsonb_build_object(
      'layout', cm.layout, 'cor_primaria', cm.cor_primaria, 'cor_destaque', cm.cor_destaque,
      'titulo', cm.titulo, 'campos', to_jsonb(cm.campos), 'rodape', cm.rodape, 'texto_verso', cm.texto_verso,
      'mostrar_logo', cm.mostrar_logo
    ) end,
    -- A logo da igreja do membro (ou a do topo da rede), se o modelo a mostra.
    case when coalesce(cm.mostrar_logo, true) then coalesce(c.logo_url, topo.logo_url) end
  from public.rol_membro_carteirinhas k
  join public.rol_membros m on m.id = k.membro_id and m.deleted_at is null
  join public.churches c on c.id = k.church_id and c.deleted_at is null
  left join public.churches topo on c.path <@ topo.path and topo.parent_id is null and topo.deleted_at is null
  left join public.carteirinha_modelos cm on cm.church_id = topo.id and cm.deleted_at is null
  left join public.rol_membro_fichas f on f.membro_id = m.id and f.deleted_at is null
  left join public.rol_membro_consentimentos s on s.membro_id = m.id and s.deleted_at is null
  where k.membro_id = p_membro_id and k.deleted_at is null;
$$;

create function public.carteirinha_do_membro(p_membro_id uuid)
returns table (
  nome text, cargos text, igreja text, igreja_sobrenome text, pastor text,
  membro_desde date, batismo date, nascimento date, estado_civil text,
  validade date, codigo text, estado text, tem_foto boolean, modelo jsonb, logo_url text, tem_link boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select d.nome, d.cargos, d.igreja, d.igreja_sobrenome, d.pastor, d.membro_desde, d.batismo, d.nascimento,
         d.estado_civil, d.validade, d.codigo, d.estado, d.foto_path is not null, d.modelo, d.logo_url,
         k.token_hash is not null
  from public.rol_membro_carteirinhas k
  cross join lateral public.carteirinha_dados(k.membro_id) d
  where k.membro_id = p_membro_id
    and k.deleted_at is null
    and public.tem_acesso(k.company_id, 'membros');
$$;

create function public.carteirinha_por_token(p_token text)
returns table (
  nome text, cargos text, igreja text, igreja_sobrenome text, pastor text,
  membro_desde date, batismo date, nascimento date, estado_civil text,
  validade date, codigo text, estado text, tem_foto boolean, modelo jsonb, logo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.nome, d.cargos, d.igreja, d.igreja_sobrenome, d.pastor, d.membro_desde, d.batismo, d.nascimento,
         d.estado_civil, d.validade, d.codigo, d.estado, d.foto_path is not null, d.modelo, d.logo_url
  from public.rol_membro_carteirinhas k
  cross join lateral public.carteirinha_dados(k.membro_id) d
  where k.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and k.deleted_at is null
    and d.estado <> 'cancelada';
$$;

revoke all on function public.carteirinha_dados(uuid) from public, anon, authenticated;
revoke all on function public.carteirinha_do_membro(uuid) from public, anon, authenticated;
revoke all on function public.carteirinha_por_token(text) from public, anon, authenticated;
grant execute on function public.carteirinha_do_membro(uuid) to authenticated;
grant execute on function public.carteirinha_por_token(text) to anon, authenticated;

notify pgrst, 'reload schema';
