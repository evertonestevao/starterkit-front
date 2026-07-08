-- Convites pendentes ENDEREÇADOS AO usuário logado, com o nome da empresa.
--
-- Por que RPC security definer: o convidado ainda não é membro, então a RLS
-- de companies (corretamente) não deixa ele ler o nome da empresa. Esta
-- função expõe SOMENTE (empresa, papel, token, expiração) dos convites
-- pendentes e não expirados do PRÓPRIO email — nada além disso vaza.
create or replace function public.my_pending_invites()
returns table (
  id uuid,
  company_name text,
  role text,
  token uuid,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select i.id, c.name, i.role, i.token, i.expires_at
  from public.company_invites i
  join public.companies c on c.id = i.company_id and c.deleted_at is null
  where i.status = 'pending'
    and i.deleted_at is null
    and i.expires_at > now()
    and lower(i.email) = lower((select u.email from auth.users u where u.id = auth.uid()))
  order by i.expires_at asc
$$;

revoke all on function public.my_pending_invites() from public;
grant execute on function public.my_pending_invites() to authenticated;
