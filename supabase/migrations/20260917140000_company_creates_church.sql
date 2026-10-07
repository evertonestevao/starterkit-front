-- Toda empresa nasce com uma igreja.
--
-- O buraco que isto fecha: o onboarding dizia "Criar igreja", mas só criava a
-- EMPRESA. Nenhum código inseria em `churches`. Sem a linha da igreja não
-- existe página pública, QR Code, domínio próprio nem link de patrocínio —
-- ou seja, o produto inteiro ficava inacessível para um cliente real.
--
-- A criação é ATÔMICA (empresa + owner + igreja numa transação só), pelo
-- mesmo motivo de `create_company`: empresa sem owner, ou empresa sem igreja,
-- é um estado que ninguém consegue consertar pela interface.

-- ---------------------------------------------------------------------------
-- Geração de identificadores únicos da igreja
-- ---------------------------------------------------------------------------
-- `churches.slug` e `churches.public_code` são únicos GLOBALMENTE (o
-- public_code é o endereço público: /t/{code}). O slug da empresa é um bom
-- ponto de partida, mas pode colidir com uma igreja já existente — daí o
-- sufixo incremental.
create or replace function public.next_available_church_slug(p_base text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_base text := coalesce(nullif(trim(p_base), ''), 'igreja');
  v_candidate text := v_base;
  v_suffix integer := 1;
begin
  while exists (
    select 1 from public.churches
    where slug = v_candidate or public_code = v_candidate
  ) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '-' || v_suffix;
    -- Trava de segurança: nunca virar laço infinito por causa de dado torto.
    if v_suffix > 999 then
      v_candidate := v_base || '-' || substr(gen_random_uuid()::text, 1, 8);
      exit;
    end if;
  end loop;

  return v_candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Criação conjunta
-- ---------------------------------------------------------------------------
create or replace function public.create_company_with_church(p_name text, p_slug text)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies;
  v_church_slug text;
begin
  insert into public.companies (name, slug, created_by)
  values (p_name, p_slug, auth.uid())
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company.id, auth.uid(), 'owner');

  v_church_slug := public.next_available_church_slug(p_slug);

  -- A igreja herda o nome digitado no onboarding. `path` é preenchido pelo
  -- trigger sync_church_path.
  insert into public.churches (company_id, name, slug, public_code, path)
  values (v_company.id, p_name, v_church_slug, v_church_slug, v_church_slug::ltree);

  return v_company;
end;
$$;

revoke all on function public.create_company_with_church(text, text) from public, anon, authenticated;
revoke all on function public.next_available_church_slug(text) from public, anon, authenticated;
grant execute on function public.create_company_with_church(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: empresas que já existem sem igreja
-- ---------------------------------------------------------------------------
-- Sem isto, quem criou conta antes desta migration continuaria sem página
-- pública — e sem jeito de conseguir uma pela interface.
do $$
declare
  v_company record;
  v_slug text;
begin
  for v_company in
    select c.id, c.name, c.slug
    from public.companies c
    where c.deleted_at is null
      and not exists (
        select 1 from public.churches ch
        where ch.company_id = c.id and ch.deleted_at is null
      )
  loop
    v_slug := public.next_available_church_slug(v_company.slug);
    insert into public.churches (company_id, name, slug, public_code, path)
    values (v_company.id, v_company.name, v_slug, v_slug, v_slug::ltree);
  end loop;
end $$;
