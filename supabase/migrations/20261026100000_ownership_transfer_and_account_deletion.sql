-- Transferência de ownership + pré-requisitos de exclusão de conta (LGPD, art. 18).
--
-- 1) transfer_company_ownership(): o owner atual passa a empresa para outro membro
--    ativo e vira admin. Security definer porque a policy de UPDATE de
--    company_members não deixa ninguém alterar a própria linha — e aqui as duas
--    linhas (a do owner e a do novo owner) mudam juntas, de forma atômica.
--
-- 2) FKs para profiles que bloqueavam a exclusão do usuário. Ao apagar
--    auth.users, o profile cai em cascata; colunas que só registram "quem fez"
--    (created_by, invited_by) passam a virar NULL em vez de impedir a exclusão.
--    Nenhuma policy de RLS é alterada.

-- ---------------------------------------------------------------------------
-- 1) Transferência de ownership
-- ---------------------------------------------------------------------------
create or replace function public.transfer_company_ownership(
  p_company_id uuid,
  p_new_owner_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.company_members;
begin
  -- Só o owner ativo da empresa pode transferir.
  if not exists (
    select 1
    from public.company_members
    where company_id = p_company_id
      and user_id = auth.uid()
      and role = 'owner'
      and deleted_at is null
  ) then
    raise exception 'apenas o owner pode transferir a empresa' using errcode = '42501';
  end if;

  -- O alvo precisa ser membro ativo DESTA empresa (id de outro tenant = não encontrado).
  select * into v_target
  from public.company_members
  where id = p_new_owner_member_id
    and company_id = p_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'membro não encontrado' using errcode = 'P0002';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'você já é o owner' using errcode = '22023';
  end if;

  update public.company_members
  set role = 'admin'
  where company_id = p_company_id
    and user_id = auth.uid()
    and deleted_at is null;

  update public.company_members
  set role = 'owner'
  where id = v_target.id;
end;
$$;

revoke execute on function public.transfer_company_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_company_ownership(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) FKs "quem fez" não podem impedir a exclusão do usuário
-- ---------------------------------------------------------------------------
alter table public.companies alter column created_by drop not null;
alter table public.companies drop constraint companies_created_by_fkey;
alter table public.companies
  add constraint companies_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.company_members drop constraint company_members_invited_by_fkey;
alter table public.company_members
  add constraint company_members_invited_by_fkey
  foreign key (invited_by) references public.profiles (id) on delete set null;

alter table public.company_invites alter column invited_by drop not null;
alter table public.company_invites drop constraint company_invites_invited_by_fkey;
alter table public.company_invites
  add constraint company_invites_invited_by_fkey
  foreign key (invited_by) references public.profiles (id) on delete set null;
