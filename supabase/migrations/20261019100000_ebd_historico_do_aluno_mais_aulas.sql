-- EBD: a página do aluno ganhou paginação e filtro por período; o histórico
-- deixa de ser cortado em 200 chamadas (uns 4 anos) e passa a 1000 (uns 19).
-- Mesma função, mesmas regras de quem vê.

create or replace function public.ebd_historico_do_aluno(p_membro_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with visiveis as (
    select mt.id, mt.classe_id, mt.desde, mt.ate, k.nome as classe_nome
    from public.ebd_matriculas mt
    join public.ebd_classes k on k.id = mt.classe_id and k.deleted_at is null
    where mt.membro_id = p_membro_id and public.can_ebd_classe(mt.classe_id)
  )
  select jsonb_build_object(
    'membro_id', m.id,
    'nome', m.nome,
    'whatsapp', m.whatsapp,
    'nascimento', m.nascimento,
    'membro_igreja', m.membro_igreja,
    'pode_editar', public.ebd_pode_editar_aluno(m.id),
    'matriculas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'classe_id', v.classe_id, 'classe_nome', v.classe_nome, 'desde', v.desde, 'ate', v.ate
      ) order by v.desde desc), '[]'::jsonb) from visiveis v
    ),
    'aulas', (
      select coalesce(jsonb_agg(x.linha order by x.data desc), '[]'::jsonb)
      from (
        select a.data, jsonb_build_object(
          'data', a.data, 'classe_nome', k.nome, 'estado', p.estado, 'licao', a.licao
        ) as linha
        from public.ebd_presencas p
        join public.ebd_aulas a on a.id = p.aula_id
        join public.ebd_classes k on k.id = a.classe_id
        where p.membro_id = m.id
          and a.classe_id in (select classe_id from visiveis)
        order by a.data desc
        limit 1000
      ) x
    )
  )
  from public.rol_membros m
  where m.id = p_membro_id and m.deleted_at is null
    and exists (select 1 from visiveis);
$$;

revoke all on function public.ebd_historico_do_aluno(uuid) from public, anon, authenticated;
grant execute on function public.ebd_historico_do_aluno(uuid) to authenticated;

notify pgrst, 'reload schema';
