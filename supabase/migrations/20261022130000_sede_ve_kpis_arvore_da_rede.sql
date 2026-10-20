-- Números agregados da ÁRVORE (a unidade vista + tudo abaixo dela), para
-- completar `rede_membros_kpis` (só a unidade) na tela de Membros da rede.
-- Pedido do Everton ao testar: ao ver uma subsede com congregações, quer os
-- dois números também somando a subsede + as congregações dela.
--
-- Mesma régua de permissão de `rede_membros_kpis` (can_admin_view_church) —
-- é número, não pessoa, então não depende de consentimento.
create or replace function public.rede_membros_kpis_arvore(p_church_id uuid)
returns table (membros_total int, membros_sem_consentimento int)
language sql
stable
security definer
set search_path = public
as $$
  select k.membros_total, k.membros_sem_consentimento
  from (
    select
      count(*) filter (where m.membro_igreja)::int as membros_total,
      count(*) filter (where m.membro_igreja and coalesce(c.cadastro, false) = false)::int as membros_sem_consentimento
    from public.churches alvo
    join public.churches unidade on unidade.path <@ alvo.path and unidade.deleted_at is null
    join public.rol_membros m on m.church_id = unidade.id and m.deleted_at is null
    left join public.rol_membro_consentimentos c on c.membro_id = m.id and c.deleted_at is null
    where alvo.id = p_church_id
      and alvo.deleted_at is null
  ) k
  where public.can_admin_view_church(p_church_id);
$$;

revoke all on function public.rede_membros_kpis_arvore(uuid) from public, anon, authenticated;
grant execute on function public.rede_membros_kpis_arvore(uuid) to authenticated;

notify pgrst, 'reload schema';
