-- ---------------------------------------------------------------------------
-- Cadastro da igreja: complemento do nome e "faz parte de uma rede?"
-- ---------------------------------------------------------------------------
-- O onboarding só perguntava o nome. Agora a igreja já nasce com:
--   sobrenome          — o complemento que a distingue das irmãs de mesmo nome
--                        ("Vila Mariana - São Paulo"); coluna que já existia, só não
--                        era preenchida no cadastro;
--   faz_parte_de_rede  — a igreja declara que pertence a uma rede/ministério;
--   rede_nome          — nome dessa rede (opcional), para a moderação agrupar.
--
-- Isto é uma DECLARAÇÃO da igreja, não um vínculo: não liga ninguém na árvore
-- (sede/subsede/congregação continua sendo por pedido aprovado ou pela
-- plataforma) e não dá acesso a dado de outra igreja. Serve para a plataforma
-- achar as demais igrejas da mesma rede e ajudar a ligá-las.

alter table public.churches
  add column if not exists faz_parte_de_rede boolean not null default false,
  add column if not exists rede_nome text;

alter table public.churches
  drop constraint if exists churches_rede_nome_tamanho;
alter table public.churches
  add constraint churches_rede_nome_tamanho
  check (rede_nome is null or char_length(btrim(rede_nome)) between 1 and 120);

-- Nome de rede sem a marca de "faz parte" é dado torto.
alter table public.churches
  drop constraint if exists churches_rede_nome_exige_rede;
alter table public.churches
  add constraint churches_rede_nome_exige_rede
  check (rede_nome is null or faz_parte_de_rede);

comment on column public.churches.faz_parte_de_rede is
  'Declaração da igreja no cadastro: pertence a uma rede de igrejas. Não é vínculo na árvore.';
comment on column public.churches.rede_nome is
  'Nome da rede/ministério declarado no cadastro (opcional). Só a moderação lê para agrupar; a página pública não mostra.';

-- Sem GRANT de update para o client: só nasce pela RPC de criação. As colunas
-- novas não herdam o SELECT por coluna do `anon` (a página pública não as lê).

-- ---------------------------------------------------------------------------
-- Criação da empresa + igreja
-- ---------------------------------------------------------------------------
-- Assinatura nova (com os campos do cadastro). A antiga sai para não sobrar um
-- overload executável que ignora o que o cadastro passou a pedir.
drop function if exists public.create_company_with_church(text, text);

create or replace function public.create_company_with_church(
  p_name text,
  p_slug text,
  p_sobrenome text default null,
  p_faz_parte_de_rede boolean default false,
  p_rede_nome text default null
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies;
  v_church_slug text;
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
  -- Nome de rede sem marcar que faz parte de uma: descarta em vez de gravar torto.
  if not v_faz_parte then
    v_rede := null;
  end if;

  insert into public.companies (name, slug, created_by)
  values (p_name, p_slug, auth.uid())
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company.id, auth.uid(), 'owner');

  v_church_slug := public.next_available_church_slug(p_slug);

  -- A igreja herda o nome digitado no onboarding. `path` é preenchido pelo
  -- trigger sync_church_path; `nome_proprio` pelo sync_church_name.
  insert into public.churches (
    company_id, name, sobrenome, slug, public_code, path, faz_parte_de_rede, rede_nome
  )
  values (
    v_company.id, p_name, v_sobrenome, v_church_slug, v_church_slug, v_church_slug::ltree,
    v_faz_parte, v_rede
  );

  return v_company;
end;
$$;

revoke all on function public.create_company_with_church(text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.create_company_with_church(text, text, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lista da plataforma: passa a devolver a rede declarada
-- ---------------------------------------------------------------------------
-- Muda o retorno, então a função é recriada (create or replace não aceita).
drop function if exists public.platform_list_churches();

create or replace function public.platform_list_churches()
returns table (
  id uuid,
  name text,
  public_code text,
  tipo text,
  parent_id uuid,
  path text,
  company_id uuid,
  created_at timestamptz,
  faz_parte_de_rede boolean,
  rede_nome text
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
  select c.id, public.church_full_name(c.name, c.sobrenome), c.public_code, c.tipo, c.parent_id,
         c.path::text, c.company_id, c.created_at, c.faz_parte_de_rede, c.rede_nome
  from public.churches c
  where c.deleted_at is null
  order by c.path;
end;
$$;

revoke all on function public.platform_list_churches() from public, anon, authenticated;
grant execute on function public.platform_list_churches() to authenticated;

notify pgrst, 'reload schema';
