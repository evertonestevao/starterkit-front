-- Cadastro só por convite (piloto).
--
-- Enquanto `platform_settings.cadastro_aberto` for falso, uma igreja nova só
-- nasce por um destes caminhos:
--   * link de vínculo da rede (church_link_invites ativo e no prazo): a igreja
--     de cima convidou;
--   * convite de "nova igreja" gerado pela plataforma (uso único);
--   * a igreja de cima cadastra e alguém assume (não passa por aqui).
-- A trava está no banco (create_company_with_church), não só na tela: uma
-- conta criada por fora (direto no Auth) não consegue criar igreja.
--
-- Contas em si não são bloqueadas no Auth: o convite de membro cria a conta
-- pelo cadastro normal. Conta sem igreja não vê nada.

alter table public.platform_settings
  add column if not exists cadastro_aberto boolean not null default false;

-- Leitura pública só do interruptor (a tela de cadastro decide o que mostrar).
create or replace function public.cadastro_aberto()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select cadastro_aberto from public.platform_settings where id = 1), false);
$$;
revoke all on function public.cadastro_aberto() from public, anon, authenticated;
grant execute on function public.cadastro_aberto() to anon, authenticated;

create or replace function public.platform_definir_cadastro_aberto(p_aberto boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_staff() then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
  update public.platform_settings
  set cadastro_aberto = coalesce(p_aberto, false), updated_at = now(), updated_by = auth.uid()
  where id = 1;
  insert into public.platform_staff_actions (staff_user_id, action, entity_type, metadata)
  values (auth.uid(), 'platform.cadastro_aberto', 'platform_settings', jsonb_build_object('aberto', coalesce(p_aberto, false)));
end;
$$;
revoke all on function public.platform_definir_cadastro_aberto(boolean) from public, anon, authenticated;
grant execute on function public.platform_definir_cadastro_aberto(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Convite de "nova igreja", gerado pela plataforma. Uso único. O banco guarda
-- só o hash do token; o link aparece uma vez para quem gerou.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_church_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Para quem é (só para a lista do painel).
  descricao text not null check (char_length(descricao) between 2 and 120),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null
);

comment on table public.platform_church_invites is
  'Convites de igreja nova gerados pela plataforma enquanto o cadastro é fechado. Uso único.';

alter table public.platform_church_invites enable row level security;
revoke all on public.platform_church_invites from anon, authenticated;
-- Sem policy: o acesso é só pelas funções abaixo.

create or replace function public.platform_criar_convite_igreja(p_token_hash text, p_descricao text, p_validade_dias int)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_expira timestamptz := now() + make_interval(days => least(greatest(coalesce(p_validade_dias, 7), 1), 30));
begin
  if not public.is_platform_staff() then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
  insert into public.platform_church_invites (token_hash, descricao, expires_at, created_by)
  values (p_token_hash, btrim(coalesce(p_descricao, '')), v_expira, auth.uid())
  returning id into v_id;
  insert into public.platform_staff_actions (staff_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'platform.convite_igreja.criado', 'platform_church_invites', v_id,
          jsonb_build_object('descricao', btrim(coalesce(p_descricao, ''))));
  return v_expira;
end;
$$;

create or replace function public.platform_convites_igreja()
returns table (id uuid, descricao text, created_at timestamptz, expires_at timestamptz,
               revoked_at timestamptz, used_at timestamptz, igreja text)
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
  select i.id, i.descricao, i.created_at, i.expires_at, i.revoked_at, i.used_at, co.name::text
  from public.platform_church_invites i
  left join public.companies co on co.id = i.company_id
  order by i.created_at desc
  limit 100;
end;
$$;

create or replace function public.platform_revogar_convite_igreja(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_staff() then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
  update public.platform_church_invites set revoked_at = now()
  where id = p_id and revoked_at is null and used_at is null;
  if found then
    insert into public.platform_staff_actions (staff_user_id, action, entity_type, entity_id)
    values (auth.uid(), 'platform.convite_igreja.revogado', 'platform_church_invites', p_id);
  end if;
end;
$$;

-- O link vale? (a página do convite mostra o formulário só se valer).
create or replace function public.convite_igreja_valido(p_token_hash text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_church_invites
    where token_hash = p_token_hash and revoked_at is null and used_at is null and expires_at > now()
  );
$$;

revoke all on function public.platform_criar_convite_igreja(text, text, int) from public, anon, authenticated;
revoke all on function public.platform_convites_igreja() from public, anon, authenticated;
revoke all on function public.platform_revogar_convite_igreja(uuid) from public, anon, authenticated;
revoke all on function public.convite_igreja_valido(text) from public, anon, authenticated;
grant execute on function public.platform_criar_convite_igreja(text, text, int) to authenticated;
grant execute on function public.platform_convites_igreja() to authenticated;
grant execute on function public.platform_revogar_convite_igreja(uuid) to authenticated;
grant execute on function public.convite_igreja_valido(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Criar igreja: com o cadastro fechado, exige um convite válido.
-- ---------------------------------------------------------------------------
drop function if exists public.create_company_with_church(text, text, text, boolean, text, text[]);
create function public.create_company_with_church(
  p_name text,
  p_slug text,
  p_sobrenome text default null,
  p_faz_parte_de_rede boolean default false,
  p_rede_nome text default null,
  p_modulos_inativos text[] default '{}',
  p_convite text default null
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
  v_hash text;
  v_convite_plataforma uuid;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;

  if not public.cadastro_aberto() then
    v_hash := case when nullif(btrim(coalesce(p_convite, '')), '') is null then null
                   else encode(sha256(convert_to(btrim(p_convite), 'UTF8')), 'hex') end;
    -- Convite da plataforma: trava a linha (uso único, sem corrida).
    select id into v_convite_plataforma from public.platform_church_invites
    where token_hash = v_hash and revoked_at is null and used_at is null and expires_at > now()
    for update;
    if v_convite_plataforma is null and not exists (
      select 1 from public.church_link_invites
      where token_hash = v_hash and status = 'ativo' and (expires_at is null or expires_at > now())
    ) then
      raise exception 'cadastro so por convite' using errcode = '42501';
    end if;
  end if;

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

  if v_convite_plataforma is not null then
    update public.platform_church_invites
    set used_at = now(), used_by = auth.uid(), company_id = v_company.id
    where id = v_convite_plataforma;
  end if;

  return v_company;
end;
$$;

revoke all on function public.create_company_with_church(text, text, text, boolean, text, text[], text) from public, anon, authenticated;
grant execute on function public.create_company_with_church(text, text, text, boolean, text, text[], text) to authenticated;

notify pgrst, 'reload schema';
