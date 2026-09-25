-- ---------------------------------------------------------------------------
-- Cargos da igreja: quem é o pastor, o presbítero, o secretário...
-- ---------------------------------------------------------------------------
-- CARGO NÃO É PERMISSÃO. Quem pode mexer no sistema continua sendo o papel em
-- `company_members` (owner/admin/member). Esta tabela só REGISTRA quem ocupa
-- cada cargo, para a igreja superior ver "Subsede Zona Norte — Pr. João" na
-- rede dela. O pastor pode nem ter conta; o secretário pode ser o owner.
--
-- A pessoa pode ganhar acesso: se o registro tem e-mail, a igreja pode enviar
-- o convite (company_invites) já a partir dele. Ao aceitar, o registro passa a
-- apontar para a conta (user_id) — ver accept_company_invite no fim.
--
-- PRIVACIDADE: nome, e-mail e telefone de líder são dado pessoal. Só owner/
-- admin da própria igreja e das igrejas ACIMA leem (can_admin_view_church).
-- Nada disto aparece em página pública; não há SELECT para anon.

-- ---------------------------------------------------------------------------
-- Catálogo de cargos
-- ---------------------------------------------------------------------------
-- Lista fechada: evita "Pastor", "pastor" e "Pr." virarem três cargos. Só a
-- plataforma escreve (migration); o client só lê. O texto exibido também está
-- em src/lib/churchLeaders.ts — os dois precisam andar juntos.
create table if not exists public.church_cargos (
  slug text primary key check (slug ~ '^[a-z_]+$'),
  label text not null,
  ordem smallint not null,
  -- true = no máximo uma pessoa ativa por igreja (índice em church_leaders).
  unico boolean not null default false
);

comment on table public.church_cargos is
  'Catálogo fechado de cargos da igreja (pastor, presbítero...). Cargo não dá permissão no sistema.';

alter table public.church_cargos enable row level security;
revoke all on public.church_cargos from anon, authenticated;
grant select on public.church_cargos to authenticated;

create policy "church_cargos_select_authenticated"
  on public.church_cargos for select
  to authenticated
  using (true);

insert into public.church_cargos (slug, label, ordem, unico) values
  ('pastor', 'Pastor', 1, true),
  ('pastor_auxiliar', 'Pastor auxiliar', 2, false),
  ('presbitero', 'Presbítero', 3, false),
  ('diacono', 'Diácono', 4, false),
  ('secretario', 'Secretário', 5, false)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Quem ocupa cada cargo
-- ---------------------------------------------------------------------------
create table if not exists public.church_leaders (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,

  cargo text not null references public.church_cargos (slug),
  nome text not null check (char_length(nome) between 2 and 120),
  -- Opcionais: o registro pode existir só para identificar a pessoa.
  email text check (email is null or char_length(email) between 5 and 254),
  telefone text check (telefone is null or char_length(telefone) between 8 and 20),

  -- Preenchido pelo sistema: o convite foi enviado / a pessoa aceitou e agora
  -- tem conta. Fora dos GRANTs de escrita do client, senão qualquer admin
  -- "vincularia" o registro à conta de outra pessoa.
  convidado_em timestamptz,
  user_id uuid references auth.users (id) on delete set null,

  -- Histórico: quando o pastor se muda, o registro dele fica com `ate`.
  desde date not null default current_date,
  ate date,

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint church_leaders_periodo check (ate is null or ate >= desde)
);

comment on table public.church_leaders is
  'Quem ocupa cada cargo da igreja. Só identifica pessoas; não concede acesso ao sistema.';

create index if not exists church_leaders_church_idx
  on public.church_leaders (church_id)
  where deleted_at is null;

-- Uma igreja tem um Pastor ativo por vez (os demais cargos aceitam vários).
create unique index if not exists church_leaders_um_pastor_idx
  on public.church_leaders (church_id)
  where cargo = 'pastor' and deleted_at is null;

drop trigger if exists set_church_leaders_company_id on public.church_leaders;
create trigger set_church_leaders_company_id
  before insert or update of church_id on public.church_leaders
  for each row execute function public.set_company_id_from_church();

drop trigger if exists set_church_leaders_updated_at on public.church_leaders;
create trigger set_church_leaders_updated_at
  before update on public.church_leaders
  for each row execute function public.set_updated_at();

alter table public.church_leaders enable row level security;
revoke all on public.church_leaders from anon, authenticated;

-- Leitura: owner/admin da própria igreja e das igrejas acima. Sem filtro de
-- deleted_at aqui de propósito (o UPDATE que marca deleted_at precisa
-- continuar enxergando a linha); a tela filtra, e o histórico fica legível.
grant select on public.church_leaders to authenticated;
create policy "church_leaders_select_admin_tree"
  on public.church_leaders for select
  to authenticated
  using (public.can_admin_view_church(church_id));

-- Escrita: só owner/admin da PRÓPRIA empresa. A igreja de cima lê, mas não
-- edita (mesma regra da árvore). `user_id` e `company_id` ficam de fora.
grant insert (church_id, cargo, nome, email, telefone, desde) on public.church_leaders to authenticated;
grant update (cargo, nome, email, telefone, desde, ate, convidado_em, deleted_at)
  on public.church_leaders to authenticated;

create policy "church_leaders_insert_admin"
  on public.church_leaders for insert
  to authenticated
  with check (
    exists (
      select 1 from public.churches c
      where c.id = church_id and c.deleted_at is null and public.is_company_admin(c.company_id)
    )
  );

create policy "church_leaders_update_admin"
  on public.church_leaders for update
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id))
  with check (company_id is not null and public.is_company_admin(company_id));

-- ---------------------------------------------------------------------------
-- Aceite do convite liga o registro à conta
-- ---------------------------------------------------------------------------
-- Mesma função de 20260704120300, com um passo a mais no fim: se a empresa
-- tem um líder cadastrado com o e-mail do convite, ele passa a apontar para
-- quem aceitou. O e-mail já foi conferido contra o da sessão logo acima, então
-- só a pessoa dona daquele endereço consegue o vínculo.
create or replace function public.accept_company_invite(p_token uuid)
returns public.company_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.company_invites;
  v_member public.company_members;
begin
  select *
  into v_invite
  from public.company_invites
  where token = p_token
    and status = 'pending'
    and deleted_at is null
    and expires_at > now()
    and lower(email) = lower(auth.jwt() ->> 'email')
  for update;

  if not found then
    raise exception 'Convite inválido, expirado ou não pertence ao usuário autenticado';
  end if;

  insert into public.company_members (company_id, user_id, role, invited_by)
  values (v_invite.company_id, auth.uid(), v_invite.role, v_invite.invited_by)
  on conflict (company_id, user_id) where deleted_at is null do nothing
  returning * into v_member;

  update public.company_invites
  set status = 'accepted', updated_at = now()
  where id = v_invite.id;

  update public.church_leaders
  set user_id = auth.uid()
  where company_id = v_invite.company_id
    and user_id is null
    and deleted_at is null
    and lower(email) = lower(v_invite.email);

  return v_member;
end;
$$;

grant execute on function public.accept_company_invite(uuid) to authenticated;

notify pgrst, 'reload schema';
