-- ---------------------------------------------------------------------------
-- EBD: presença por domingo num período (gráfico dos relatórios)
-- ---------------------------------------------------------------------------
-- Uma linha por data com aula, somando as classes que quem pergunta pode ver
-- (gestão: todas; professor: as dele — can_ebd_classe). p_classe_id filtra
-- uma classe; NULL = todas. Só números, sem nomes.
create or replace function public.ebd_presenca_por_domingo(
  p_church_id uuid,
  p_classe_id uuid,
  p_de date,
  p_ate date
)
returns table (data date, presentes int, ausentes int, justificados int, visitantes int)
language sql
stable
security definer
set search_path = public
as $$
  select a.data,
         coalesce(sum((select count(*) from public.ebd_presencas p where p.aula_id = a.id and p.estado = 'presente')), 0)::int,
         coalesce(sum((select count(*) from public.ebd_presencas p where p.aula_id = a.id and p.estado = 'ausente')), 0)::int,
         coalesce(sum((select count(*) from public.ebd_presencas p where p.aula_id = a.id and p.estado = 'justificado')), 0)::int,
         coalesce(sum((select count(*) from public.ebd_visitantes v where v.aula_id = a.id)), 0)::int
  from public.ebd_aulas a
  join public.ebd_classes k on k.id = a.classe_id
  where k.church_id = p_church_id
    and k.deleted_at is null
    and (p_classe_id is null or k.id = p_classe_id)
    and a.data between p_de and p_ate
    and public.can_ebd_classe(k.id)
  group by a.data
  order by a.data;
$$;

revoke all on function public.ebd_presenca_por_domingo(uuid, uuid, date, date) from public, anon, authenticated;
grant execute on function public.ebd_presenca_por_domingo(uuid, uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
