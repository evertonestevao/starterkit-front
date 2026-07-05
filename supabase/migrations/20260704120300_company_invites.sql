-- company_invites: convite pendente para alguém entrar numa empresa com um determinado
-- papel. company_id identifica o tenant dono do convite; deleted_at permite soft delete
-- (ex: convite cancelado manualmente, distinto de "revoked"/"expired" que são status).
create table public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  role text not null references public.roles (code) default 'member',
  invited_by uuid not null references public.profiles (id),
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Evita múltiplos convites pendentes duplicados para o mesmo e-mail na mesma empresa.
create unique index company_invites_pending_unique_idx
  on public.company_invites (company_id, lower(email))
  where status = 'pending' and deleted_at is null;

create index company_invites_company_id_idx on public.company_invites (company_id) where deleted_at is null;

create trigger set_company_invites_updated_at
  before update on public.company_invites
  for each row
  execute function public.set_updated_at();

alter table public.company_invites enable row level security;

-- Ver GRANT no comentário de profiles: tabelas de dono "postgres" precisam de GRANT
-- explícito para authenticated, senão o acesso é negado antes da RLS ser avaliada.
grant select, insert, update on public.company_invites to authenticated;

-- SELECT: owner/admin da empresa veem todos os convites dela (para gerenciar/revogar).
-- Além disso, o próprio convidado pode ver o convite pendente destinado ao e-mail da
-- sessão autenticada (para mostrar "você tem um convite pendente" após login).
create policy "company_invites_select_admin_or_invitee"
  on public.company_invites
  for select
  to authenticated
  using (
    public.is_company_admin(company_id)
    or lower(email) = lower(auth.jwt() ->> 'email')
  );

-- INSERT: só owner/admin podem criar convites, e sempre em nome de quem está logado.
create policy "company_invites_insert_admin"
  on public.company_invites
  for insert
  to authenticated
  with check (
    public.is_company_admin(company_id)
    and invited_by = auth.uid()
  );

-- UPDATE: só owner/admin podem alterar o convite (ex: revogar, setar deleted_at).
-- O aceite do convite (que cria a linha em company_members) é feito via RPC
-- accept_company_invite(), não por UPDATE direto, pois quem aceita ainda não é membro
-- e não passaria em is_company_admin/is_company_member.
create policy "company_invites_update_admin"
  on public.company_invites
  for update
  to authenticated
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

-- Não há policy de DELETE: cancelamento de convite é soft delete via UPDATE.

-- RPC de aceite: valida token, status, expiração e que o e-mail do convite bate com o
-- e-mail da sessão autenticada; só então cria o membro e marca o convite como aceito.
-- security definer é necessário porque, no momento do aceite, o usuário ainda não é
-- membro da empresa (não passaria nas policies normais de company_members/is_company_*).
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

  return v_member;
end;
$$;

grant execute on function public.accept_company_invite(uuid) to authenticated;
