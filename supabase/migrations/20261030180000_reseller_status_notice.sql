-- O vendedor suspenso não enxerga nada pelas views, de propósito. Esta função diz só o
-- status do próprio cadastro, para a tela explicar o bloqueio.
create or replace function public.my_reseller_status()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select r.status
  from public.resellers r
  where r.user_id = auth.uid()
    and r.deleted_at is null;
$$;

grant execute on function public.my_reseller_status() to authenticated;
