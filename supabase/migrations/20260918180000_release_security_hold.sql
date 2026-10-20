-- ---------------------------------------------------------------------------
-- Destravar conta de patrocinador bloqueada pelo "não fui eu"
-- ---------------------------------------------------------------------------
-- A migration 20260918120000 criou a tranca (`security_hold_at`) e não criou a
-- chave: a tela manda o patrocinador falar com o suporte, e o suporte não
-- tinha por onde liberar a não ser rodando SQL na mão. Uma conta que pagou
-- ficava travada por tempo indeterminado, esperando alguém lembrar de um
-- `update`.

-- Fila de contas travadas. Vem com a última alteração desfeita junto, porque
-- é o que o operador precisa para decidir se libera: o que tentaram mudar.
create or replace function public.list_security_holds()
returns table (
  sponsor_account_id uuid,
  display_name text,
  email text,
  security_hold_at timestamptz,
  ultima_tentativa_nome text,
  ultima_tentativa_em timestamptz
)
language sql
security definer
set search_path = public
stable
as $fn$
  select
    sa.id,
    sa.display_name,
    sa.email,
    sa.security_hold_at,
    c.novo_display_name,
    c.decided_at
  from public.sponsor_accounts sa
  left join lateral (
    select novo_display_name, decided_at
    from public.sponsor_profile_changes
    where sponsor_account_id = sa.id and status = 'revertida'
    order by decided_at desc nulls last
    limit 1
  ) c on true
  where sa.security_hold_at is not null
    and sa.deleted_at is null
    and public.is_platform_staff()
  order by sa.security_hold_at asc;
$fn$;

-- Liberar. Não desfaz nada nem republica o que foi revertido: devolve só a
-- possibilidade de pedir alteração de novo, e o próximo pedido passa pela
-- fila como qualquer outro.
create or replace function public.release_sponsor_security_hold(
  p_sponsor_account_id uuid,
  p_via text default 'painel'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_conta public.sponsor_accounts%rowtype;
begin
  if not public.is_platform_staff() then
    raise exception 'Apenas a moderação da plataforma pode liberar' using errcode = '42501';
  end if;

  select * into v_conta
  from public.sponsor_accounts
  where id = p_sponsor_account_id
    and security_hold_at is not null
    and deleted_at is null;

  if v_conta.id is null then
    return false;
  end if;

  update public.sponsor_accounts
  set security_hold_at = null
  where id = v_conta.id;

  insert into public.platform_staff_actions (staff_user_id, action, entity_type, entity_id, via, metadata)
  values (
    auth.uid(),
    'sponsor_account.hold_liberado',
    'sponsor_account',
    v_conta.id,
    p_via,
    jsonb_build_object('bloqueada_desde', v_conta.security_hold_at)
  );

  return true;
end;
$fn$;

revoke all on function public.list_security_holds() from public, anon, authenticated;
revoke all on function public.release_sponsor_security_hold(uuid, text) from public, anon, authenticated;

grant execute on function public.list_security_holds() to authenticated;
grant execute on function public.release_sponsor_security_hold(uuid, text) to authenticated;

notify pgrst, 'reload schema';
