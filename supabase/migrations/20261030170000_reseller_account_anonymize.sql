-- Exclusão da conta de um vendedor (LGPD): os lançamentos financeiros ficam, mas sem os
-- dados pessoais dele. Antes de apagar o usuário, porque depois user_id já virou NULL.
-- A aplicação bloqueia a exclusão enquanto houver comissão pendente.
create or replace function public.anonymize_reseller_on_user_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reseller_id uuid;
begin
  update public.resellers
  set name = 'Vendedor excluído',
      email = 'excluido-' || id || '@removido.invalid',
      status = 'suspended'
  where user_id = old.id
  returning id into v_reseller_id;

  if v_reseller_id is not null then
    -- O histórico guardava nome e e-mail; o resto dele continua valendo.
    update public.reseller_audit_log
    set old_values = old_values - 'name' - 'email',
        new_values = new_values - 'name' - 'email'
    where table_name = 'resellers' and record_id = v_reseller_id;
  end if;

  return old;
end;
$$;

create trigger on_auth_user_delete_anonymize_reseller
  before delete on auth.users
  for each row
  execute function public.anonymize_reseller_on_user_delete();
