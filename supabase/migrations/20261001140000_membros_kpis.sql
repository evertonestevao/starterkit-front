-- ---------------------------------------------------------------------------
-- Indicadores da tela de Membros
-- ---------------------------------------------------------------------------
-- Uma função, uma ida ao banco. security invoker: lê com a RLS de quem
-- chama (can_acompanhar) — quem não pode ver o rol recebe zeros, nunca os
-- números de outra igreja.

create or replace function public.membros_kpis(p_church_id uuid)
returns table (
  ativos int,
  inativos int,
  novos_no_mes int,
  aniversariantes_do_mes int,
  com_cargo int,
  -- % de presença nas últimas 8 semanas, só sobre cultos sem justificativa.
  presenca_media numeric,
  em_alerta int
)
language sql
stable
security invoker
set search_path = public
as $$
  with rol as (
    select m.id, m.ativo, m.created_at, m.nascimento
    from public.rol_membros m
    where m.church_id = p_church_id and m.deleted_at is null
  ),
  presenca as (
    select count(*) filter (where e.estado = 'presente') as p,
           count(*) filter (where e.estado in ('presente', 'ausente')) as base
    from public.acompanhamento_presencas_efetivas e
    join rol on rol.id = e.membro_id and rol.ativo
    where e.church_id = p_church_id and e.data >= current_date - 56
  )
  select
    (select count(*) from rol where ativo)::int,
    (select count(*) from rol where not ativo)::int,
    (select count(*) from rol
      where date_trunc('month', created_at at time zone 'America/Sao_Paulo')
          = date_trunc('month', now() at time zone 'America/Sao_Paulo'))::int,
    (select count(*) from rol
      where ativo and extract(month from nascimento) = extract(month from now() at time zone 'America/Sao_Paulo'))::int,
    (select count(distinct rc.membro_id) from public.rol_membro_cargos rc
      join rol on rol.id = rc.membro_id and rol.ativo
      where rc.church_id = p_church_id)::int,
    (select round(100.0 * p / nullif(base, 0), 1) from presenca),
    (select count(*) from public.acompanhamento_alertas(p_church_id))::int;
$$;

revoke all on function public.membros_kpis(uuid) from public, anon, authenticated;
grant execute on function public.membros_kpis(uuid) to authenticated;

notify pgrst, 'reload schema';
