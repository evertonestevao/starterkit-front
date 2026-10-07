-- ---------------------------------------------------------------------------
-- Contagem de pendências da moderação, para os badges do menu
-- ---------------------------------------------------------------------------
-- O menu aparece em TODAS as telas da plataforma. Buscar as filas inteiras
-- só para contar seria trazer nome, email e motivo de cada caso a cada
-- navegação. Uma função que devolve só os números resolve em uma ida ao banco.
--
-- Conta apenas o que tem ação para tomar e some quando é resolvido. O sinal
-- de "escondido por várias igrejas" fica de fora de propósito: ele não tem
-- botão que o resolva, e um badge que nunca zera ensina a ignorar badges.
create or replace function public.platform_pending_counts()
returns table (
  alteracoes integer,
  contas_travadas integer,
  denuncias integer
)
language sql
security definer
set search_path = public
stable
as $fn$
  select
    (select count(*)::integer from public.sponsor_profile_changes where status = 'pendente'),
    (select count(*)::integer from public.sponsor_accounts
      where security_hold_at is not null and deleted_at is null),
    (select count(*)::integer from public.sponsor_abuse_reports where status = 'aberta')
  where public.is_platform_staff();
$fn$;

revoke all on function public.platform_pending_counts() from public, anon, authenticated;
grant execute on function public.platform_pending_counts() to authenticated;

notify pgrst, 'reload schema';
