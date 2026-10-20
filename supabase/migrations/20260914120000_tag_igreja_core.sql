create extension if not exists pgcrypto;
create extension if not exists ltree;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.churches (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.churches (id) on delete set null,
  name text not null,
  slug text not null unique,
  logo_url text,
  address text,
  service_times jsonb not null default '{}'::jsonb,
  social_links jsonb not null default '{}'::jsonb,
  path ltree not null,
  template_mode text not null default 'inherit' check (template_mode in ('inherit', 'custom')),
  template_id uuid references public.templates (id) on delete set null,
  public_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_churches_updated_at
  before update on public.churches
  for each row
  execute function public.set_updated_at();

create or replace function public.sync_church_path()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent_path text;
begin
  if new.parent_id is null then
    new.path = new.slug::ltree;
  else
    select path::text into v_parent_path
    from public.churches
    where id = new.parent_id;

    if v_parent_path is null or v_parent_path = '' then
      new.path = new.slug::ltree;
    else
      new.path = (v_parent_path || '.' || new.slug)::ltree;
    end if;
  end if;

  return new;
end;
$$;

create trigger sync_church_path_before_write
  before insert or update of parent_id, slug
  on public.churches
  for each row
  execute function public.sync_church_path();

create or replace function public.resolve_template(p_church_id uuid)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_current_id uuid := p_church_id;
  v_record record;
  v_depth integer := 0;
begin
  loop
    exit when v_current_id is null;
    select * into v_record
    from public.churches
    where id = v_current_id;

    if v_record is null then
      return null;
    end if;

    if v_record.template_mode = 'custom' and v_record.template_id is not null then
      return v_record.template_id;
    end if;

    if v_record.parent_id is null then
      return null;
    end if;

    v_current_id := v_record.parent_id;
    v_depth := v_depth + 1;

    if v_depth > 50 then
      return null;
    end if;
  end loop;

  return null;
end;
$$;

create table public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  name text,
  message text not null,
  created_at timestamptz not null default now()
);

create table public.event_signups (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  event_name text not null,
  person_name text not null,
  contact text not null,
  created_at timestamptz not null default now()
);

create table public.visitors (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  name text not null,
  contact text not null,
  created_at timestamptz not null default now()
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  name text not null,
  logo_url text,
  status text not null default 'active' check (status in ('active', 'pending')),
  tier integer check (tier between 1 and 4),
  created_at timestamptz not null default now()
);

create or replace function public.auth_church_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select null::uuid;
$$;

grant execute on function public.auth_church_id() to anon, authenticated;
grant select on public.templates to anon, authenticated;
grant select on public.churches to anon, authenticated;
grant insert, update on public.churches to authenticated;
grant insert on public.prayer_requests to anon, authenticated;
grant insert on public.event_signups to anon, authenticated;
grant insert on public.visitors to anon, authenticated;
grant select on public.sponsors to anon, authenticated;
grant insert, update on public.sponsors to authenticated;

alter table public.templates enable row level security;
alter table public.churches enable row level security;
alter table public.prayer_requests enable row level security;
alter table public.event_signups enable row level security;
alter table public.visitors enable row level security;
alter table public.sponsors enable row level security;

create policy "templates_public_select"
  on public.templates
  for select
  to anon, authenticated
  using (true);

create policy "churches_public_select"
  on public.churches
  for select
  to anon, authenticated
  using (true);

create policy "churches_update_same_church"
  on public.churches
  for update
  to authenticated
  using (id = public.auth_church_id())
  with check (id = public.auth_church_id());

create policy "prayer_requests_insert_public"
  on public.prayer_requests
  for insert
  to anon, authenticated
  with check (church_id is not null and message <> '');

create policy "event_signups_insert_public"
  on public.event_signups
  for insert
  to anon, authenticated
  with check (church_id is not null and event_name <> '' and person_name <> '' and contact <> '');

create policy "visitors_insert_public"
  on public.visitors
  for insert
  to anon, authenticated
  with check (church_id is not null and name <> '' and contact <> '');

create policy "sponsors_public_select"
  on public.sponsors
  for select
  to anon, authenticated
  using (status = 'active' or true);

create policy "sponsors_manage_authenticated_insert"
  on public.sponsors
  for insert
  to authenticated
  with check (true);

create policy "sponsors_manage_authenticated_update"
  on public.sponsors
  for update
  to authenticated
  using (true)
  with check (true);

create policy "sponsors_manage_authenticated_delete"
  on public.sponsors
  for delete
  to authenticated
  using (true);

insert into public.templates (name, slug, description)
values
  ('Clássico', 'classico', 'Tema clássico com header navy e destaques em vinho.'),
  ('Clean', 'clean', 'Tema leve, minimalista e acessível para divulgação simples.'),
  ('Dark', 'dark', 'Tema grafite com selo moderno e fundo mais profundo.');

insert into public.churches (
  parent_id,
  name,
  slug,
  logo_url,
  address,
  service_times,
  social_links,
  path,
  template_mode,
  template_id,
  public_code
)
values
  (null, 'Comunidade Cristã Betel', 'comunidade-crista-betel', null, 'Rua das Flores, 540 - Centro, São Paulo/SP', '{"domingo":"09:00","quarta":"19:30"}'::jsonb, '{"instagram":"https://instagram.com/betel","youtube":"https://youtube.com/betel"}'::jsonb, 'comunidade-crista-betel'::ltree, 'custom', (select id from public.templates where slug = 'dark'), 'betel'),
  ((select id from public.churches where slug = 'comunidade-crista-betel'), 'Betel Lins', 'betel-lins', null, 'Av. Industrial, 230 - Lins/SP', '{"domingo":"10:30"}'::jsonb, '{"instagram":"https://instagram.com/betellins"}'::jsonb, 'comunidade-crista-betel.betel-lins'::ltree, 'inherit', null, 'betel-lins'),
  ((select id from public.churches where slug = 'betel-lins'), 'Betel Lins - Bairro Industrial', 'betel-lins-bairro-industrial', null, 'Rua da Fábrica, 78 - Bairro Industrial, Lins/SP', '{"domingo":"18:00"}'::jsonb, '{"whatsapp":"https://wa.me/5513999999999"}'::jsonb, 'comunidade-crista-betel.betel-lins.betel-lins-bairro-industrial'::ltree, 'inherit', null, 'betel-lins-industrial'),
  (null, 'Igreja Renovada Vida Nova', 'igreja-renovada-vida-nova', null, 'Praça da Fé, 12 - Ribeirão Preto/SP', '{"domingo":"08:30","quarta":"19:00"}'::jsonb, '{"instagram":"https://instagram.com/vidanova"}'::jsonb, 'igreja-renovada-vida-nova'::ltree, 'custom', (select id from public.templates where slug = 'classico'), 'vida-nova');

insert into public.sponsors (church_id, name, logo_url, status, tier)
values
  ((select id from public.churches where public_code = 'betel'), 'Luz & Vida', null, 'active', 1),
  ((select id from public.churches where public_code = 'betel'), 'Fazenda Esperança', null, 'active', 2),
  ((select id from public.churches where public_code = 'betel-lins'), 'Casa do Pão', null, 'active', 1),
  ((select id from public.churches where public_code = 'betel-lins'), 'Mãos Amigas', null, 'pending', 3),
  ((select id from public.churches where public_code = 'betel-lins-industrial'), 'Nova Visão', null, 'active', 2),
  ((select id from public.churches where public_code = 'vida-nova'), 'Ação Social', null, 'active', 1),
  ((select id from public.churches where public_code = 'vida-nova'), 'Sementes do Céu', null, 'active', 2);
