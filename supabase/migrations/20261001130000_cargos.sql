-- ---------------------------------------------------------------------------
-- Cargos: um catálogo só, com herança pela hierarquia
-- ---------------------------------------------------------------------------
-- Até aqui o catálogo era fixo (`church_cargos`: Pastor, Pastor auxiliar,
-- Presbítero, Diácono, Secretário), escrito só por migration. Agora:
--
--   * a PLATAFORMA mantém cargos padrão (church_id NULL) que toda igreja vê,
--     mesmo sem sede — ninguém edita pelo painel;
--   * cada igreja cria os SEUS cargos (church_id = a igreja);
--   * uma igreja vê os cargos dela e os das igrejas ACIMA (sede -> subsede ->
--     congregação). As de baixo herdam e usam, mas não editam.
--   * só quem criou edita: owner/admin da igreja dona do cargo. A sede não
--     mexe nos cargos da congregação, nem vê os que ela criou.
--
-- Quem ocupa cada cargo:
--   * church_leaders (pessoa com e-mail/convite ao sistema) passa a apontar
--     para o catálogo por `cargo_id`, no lugar do slug fixo;
--   * rol_membros (membros da chamada) ganham cargos — vários por pessoa —
--     em `rol_membro_cargos`.
--
-- CARGO CONTINUA NÃO SENDO PERMISSÃO no sistema (isso é company_members).
--
-- `unico` (ex.: Pastor): no máximo UMA pessoa ativa com o cargo por igreja,
-- em cada uma das duas tabelas de ocupação.

-- ---------------------------------------------------------------------------
-- 1. Catálogo
-- ---------------------------------------------------------------------------
create table if not exists public.cargos (
  id uuid primary key default gen_random_uuid(),
  -- NULL = cargo padrão da plataforma.
  church_id uuid references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  -- Só nos da plataforma: nome estável para o código (ex.: 'pastor').
  slug text unique check (slug is null or slug ~ '^[a-z_]+$'),
  nome text not null check (char_length(nome) between 2 and 60),
  descricao text check (descricao is null or char_length(descricao) <= 200),
  unico boolean not null default false,
  ordem smallint not null default 100 check (ordem between 0 and 999),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cargos_slug_so_plataforma check (slug is null or church_id is null)
);

comment on table public.cargos is
  'Catálogo de cargos. church_id NULL = padrão da plataforma; senão, criado pela igreja e herdado pelas de baixo.';

-- Mesmo nome duas vezes no mesmo dono confunde ("Diácono" e "diácono").
create unique index if not exists cargos_nome_por_dono_idx
  on public.cargos (coalesce(church_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome))
  where deleted_at is null;
create index if not exists cargos_church_idx on public.cargos (church_id) where deleted_at is null;

drop trigger if exists set_cargos_company_id on public.cargos;
create trigger set_cargos_company_id
  before insert or update of church_id on public.cargos
  for each row execute function public.set_company_id_from_church();

drop trigger if exists set_cargos_updated_at on public.cargos;
create trigger set_cargos_updated_at
  before update on public.cargos
  for each row execute function public.set_updated_at();

-- Padrões da plataforma: os cinco do catálogo antigo (mesmos slugs) e mais
-- alguns comuns nas igrejas.
insert into public.cargos (slug, nome, unico, ordem)
select slug, label, unico, ordem from public.church_cargos
on conflict (slug) do nothing;

insert into public.cargos (slug, nome, unico, ordem) values
  ('evangelista', 'Evangelista', false, 6),
  ('missionario', 'Missionário(a)', false, 7),
  ('diaconisa', 'Diaconisa', false, 8),
  ('tesoureiro', 'Tesoureiro(a)', false, 9),
  ('lider_louvor', 'Líder de louvor', false, 10),
  ('lider_jovens', 'Líder de jovens', false, 11),
  ('professor_ebd', 'Professor(a) da EBD', false, 12),
  ('obreiro', 'Obreiro(a)', false, 13)
on conflict (slug) do nothing;

update public.cargos set nome = 'Secretário(a)' where slug = 'secretario';

-- ---------------------------------------------------------------------------
-- 2. Quem vê e quem usa
-- ---------------------------------------------------------------------------
-- O cargo da igreja `p_dono` é visível para quem é de `p_dono` ou de uma
-- igreja ABAIXO dela (qualquer papel). Da plataforma (NULL): todo mundo.
create or replace function public.can_view_cargo(p_dono uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_dono is null or exists (
    select 1
    from public.churches dono
    join public.churches minha on minha.path <@ dono.path
    join public.company_members cm on cm.company_id = minha.company_id
    where dono.id = p_dono
      and dono.deleted_at is null
      and minha.deleted_at is null
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
  );
$$;

-- A igreja `p_church` pode usar o cargo? (dele mesmo, de cima, ou da plataforma)
create or replace function public.cargo_disponivel_para(p_cargo uuid, p_church uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cargos c
    join public.churches alvo on alvo.id = p_church
    left join public.churches dono on dono.id = c.church_id
    where c.id = p_cargo
      and c.deleted_at is null
      and (c.church_id is null or (dono.deleted_at is null and alvo.path <@ dono.path))
  );
$$;

-- Cargos que a igreja `p_church` enxerga (padrão + de cima + os dela), com o
-- nome da igreja dona. Só para quem é da própria igreja (qualquer papel):
-- quem faz a chamada também precisa da lista para dar cargo a membro.
create or replace function public.cargos_visiveis(p_church uuid)
returns table (
  id uuid,
  church_id uuid,
  dono_nome text,
  slug text,
  nome text,
  descricao text,
  unico boolean,
  ordem smallint,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.church_id, dono.name, c.slug, c.nome, c.descricao, c.unico, c.ordem, c.deleted_at
  from public.churches alvo
  join public.cargos c on true
  left join public.churches dono on dono.id = c.church_id
  where alvo.id = p_church
    and alvo.deleted_at is null
    and public.is_company_member(alvo.company_id)
    and (c.church_id is null or (dono.deleted_at is null and alvo.path <@ dono.path))
  order by c.ordem, c.nome;
$$;

revoke all on function public.cargos_visiveis(uuid) from public, anon, authenticated;
grant execute on function public.cargos_visiveis(uuid) to authenticated;

revoke all on function public.can_view_cargo(uuid) from public, anon, authenticated;
revoke all on function public.cargo_disponivel_para(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_view_cargo(uuid) to authenticated;
grant execute on function public.cargo_disponivel_para(uuid, uuid) to authenticated;

alter table public.cargos enable row level security;
revoke all on public.cargos from anon, authenticated;
grant select on public.cargos to authenticated;
-- Plataforma (slug, church_id NULL) só por migration: fora dos GRANTs.
grant insert (church_id, nome, descricao, unico, ordem) on public.cargos to authenticated;
grant update (nome, descricao, unico, ordem, deleted_at) on public.cargos to authenticated;

drop policy if exists "cargos_select_arvore" on public.cargos;
create policy "cargos_select_arvore"
  on public.cargos for select
  to authenticated
  using (public.can_view_cargo(church_id));

-- Só quem criou: owner/admin da igreja dona. A plataforma (NULL) nunca.
drop policy if exists "cargos_insert_dono" on public.cargos;
create policy "cargos_insert_dono"
  on public.cargos for insert
  to authenticated
  with check (
    church_id is not null and exists (
      select 1 from public.churches c
      where c.id = church_id and c.deleted_at is null and c.company_id is not null
        and public.is_company_admin(c.company_id)
    )
  );

drop policy if exists "cargos_update_dono" on public.cargos;
create policy "cargos_update_dono"
  on public.cargos for update
  to authenticated
  using (church_id is not null and company_id is not null and public.is_company_admin(company_id))
  with check (church_id is not null and company_id is not null and public.is_company_admin(company_id));

-- ---------------------------------------------------------------------------
-- 3. church_leaders aponta para o catálogo
-- ---------------------------------------------------------------------------
alter table public.church_leaders add column if not exists cargo_id uuid references public.cargos (id);

update public.church_leaders l
set cargo_id = c.id
from public.cargos c
where c.slug = l.cargo and l.cargo_id is null;

alter table public.church_leaders alter column cargo_id set not null;

drop index if exists public.church_leaders_um_pastor_idx;
alter table public.church_leaders drop column if exists cargo;
create index if not exists church_leaders_cargo_idx on public.church_leaders (cargo_id) where deleted_at is null;

grant insert (cargo_id) on public.church_leaders to authenticated;
grant update (cargo_id) on public.church_leaders to authenticated;

-- O catálogo antigo sai: tudo agora lê `cargos`.
drop table if exists public.church_cargos;

-- ---------------------------------------------------------------------------
-- 4. Cargos dos membros do rol (vários por pessoa)
-- ---------------------------------------------------------------------------
create table if not exists public.rol_membro_cargos (
  membro_id uuid not null references public.rol_membros (id) on delete cascade,
  cargo_id uuid not null references public.cargos (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  desde date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (membro_id, cargo_id)
);

create index if not exists rol_membro_cargos_church_idx on public.rol_membro_cargos (church_id, cargo_id);

drop trigger if exists set_rol_membro_cargos_company_id on public.rol_membro_cargos;
create trigger set_rol_membro_cargos_company_id
  before insert or update of church_id on public.rol_membro_cargos
  for each row execute function public.set_company_id_from_church();

-- Mesma regra da chamada: só quem opera a própria igreja (LGPD — cargo de
-- membro é dado pessoal; a igreja de cima não lê).
alter table public.rol_membro_cargos enable row level security;
revoke all on public.rol_membro_cargos from anon, authenticated;
grant select, delete on public.rol_membro_cargos to authenticated;
grant insert (membro_id, cargo_id, church_id, desde) on public.rol_membro_cargos to authenticated;

drop policy if exists "rol_membro_cargos_select_own" on public.rol_membro_cargos;
create policy "rol_membro_cargos_select_own" on public.rol_membro_cargos for select to authenticated
  using (public.can_acompanhar(church_id));
drop policy if exists "rol_membro_cargos_insert_own" on public.rol_membro_cargos;
create policy "rol_membro_cargos_insert_own" on public.rol_membro_cargos for insert to authenticated
  with check (public.can_acompanhar(church_id));
drop policy if exists "rol_membro_cargos_delete_own" on public.rol_membro_cargos;
create policy "rol_membro_cargos_delete_own" on public.rol_membro_cargos for delete to authenticated
  using (public.can_acompanhar(church_id));

-- ---------------------------------------------------------------------------
-- 5. Coerência da ocupação (as duas tabelas)
-- ---------------------------------------------------------------------------
-- * o cargo tem que estar disponível para a igreja (dela, de cima ou padrão);
-- * no rol, o membro tem que ser da mesma igreja;
-- * cargo `unico`: uma pessoa ativa por igreja (erro 23505, como o índice
--   único que existia para o Pastor).
create or replace function public.confere_ocupacao_cargo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unico boolean;
  v_outro boolean;
begin
  -- Dois ifs: o PL/pgSQL avalia new.deleted_at mesmo com a 1ª condição falsa,
  -- e rol_membro_cargos não tem essa coluna.
  if tg_table_name = 'church_leaders' then
    if new.deleted_at is not null then
      return new; -- encerrar o cargo não passa pelas checagens
    end if;
  end if;

  -- Atualização que não troca o cargo (ex.: editar o telefone) não revalida
  -- a disponibilidade: um cargo desativado depois continua no histórico.
  if tg_op = 'INSERT' or new.cargo_id is distinct from old.cargo_id then
    if not public.cargo_disponivel_para(new.cargo_id, new.church_id) then
      raise exception 'cargo indisponivel para esta igreja' using errcode = 'check_violation';
    end if;
  end if;

  if tg_table_name = 'rol_membro_cargos' then
    if not exists (select 1 from public.rol_membros m where m.id = new.membro_id and m.church_id = new.church_id) then
      raise exception 'membro de outra igreja' using errcode = 'check_violation';
    end if;
  end if;

  select unico into v_unico from public.cargos where id = new.cargo_id;
  if v_unico then
    -- Duas abas cadastrando o Pastor ao mesmo tempo: a segunda espera a
    -- primeira terminar e então enxerga a linha dela.
    perform pg_advisory_xact_lock(hashtext(tg_table_name || new.church_id::text || new.cargo_id::text));
    if tg_table_name = 'church_leaders' then
      select exists (
        select 1 from public.church_leaders l
        where l.church_id = new.church_id and l.cargo_id = new.cargo_id
          and l.deleted_at is null and l.id <> new.id
          -- Num UPDATE, a versão antiga da própria linha não conta como "outra".
          and (tg_op = 'INSERT' or l.id <> old.id)
      ) into v_outro;
    else
      select exists (
        select 1 from public.rol_membro_cargos r
        where r.church_id = new.church_id and r.cargo_id = new.cargo_id and r.membro_id <> new.membro_id
      ) into v_outro;
    end if;
    if v_outro then
      raise exception 'este cargo aceita uma pessoa so por igreja' using errcode = 'unique_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.confere_ocupacao_cargo() from public, anon, authenticated;

drop trigger if exists church_leaders_confere_cargo on public.church_leaders;
create trigger church_leaders_confere_cargo
  before insert or update on public.church_leaders
  for each row execute function public.confere_ocupacao_cargo();

drop trigger if exists rol_membro_cargos_confere_cargo on public.rol_membro_cargos;
create trigger rol_membro_cargos_confere_cargo
  before insert or update on public.rol_membro_cargos
  for each row execute function public.confere_ocupacao_cargo();

notify pgrst, 'reload schema';
