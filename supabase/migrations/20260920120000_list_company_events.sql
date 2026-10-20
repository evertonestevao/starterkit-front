-- ---------------------------------------------------------------------------
-- Eventos da empresa com a contagem de inscritos, para o painel da igreja
-- ---------------------------------------------------------------------------
-- A tela contava inscritos por evento agrupando as 20 inscrições da PÁGINA
-- aberta: com mais de 20, os números saíam errados. A contagem passa a vir
-- do banco, por evento, numa consulta só (e não uma por evento).
--
-- SECURITY INVOKER de propósito: evento publicado já é público, e a contagem
-- de inscritos passa pela RLS de event_signups — quem não é da empresa vê os
-- eventos com zero inscritos, não os números de outra igreja.
create or replace function public.list_company_events(p_company_id uuid)
returns table (
  id uuid,
  church_id uuid,
  church_name text,
  titulo text,
  descricao text,
  inicio timestamptz,
  fim timestamptz,
  local text,
  preco_cents integer,
  inscricoes_abertas boolean,
  inscritos integer
)
language sql
stable
set search_path = public
as $fn$
  select
    e.id,
    e.church_id,
    c.name,
    e.titulo,
    e.descricao,
    e.inicio,
    e.fim,
    e.local,
    e.preco_cents,
    e.inscricoes_abertas,
    (select count(*)::integer from public.event_signups s where s.event_id = e.id)
  from public.church_events e
  join public.churches c on c.id = e.church_id
  where e.company_id = p_company_id
    and e.deleted_at is null
  order by e.inicio asc;
$fn$;

revoke all on function public.list_company_events(uuid) from public, anon, authenticated;
grant execute on function public.list_company_events(uuid) to authenticated;

notify pgrst, 'reload schema';
