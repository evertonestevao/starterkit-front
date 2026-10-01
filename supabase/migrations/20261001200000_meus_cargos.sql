-- ---------------------------------------------------------------------------
-- Os cargos da própria pessoa (para o painel: "Seu cargo: Pastor")
-- ---------------------------------------------------------------------------
-- Quem tem papel member sem autorização de chamada não lê o rol, nem a
-- própria linha. Esta função devolve SÓ os nomes dos cargos do membro ligado
-- à conta de quem pergunta, na igreja da empresa — nada de outras pessoas.
create or replace function public.meus_cargos(p_company_id uuid)
returns table (nome text)
language sql
stable
security definer
set search_path = public
as $$
  select c.nome
  from public.rol_membros m
  join public.churches ch on ch.id = m.church_id and ch.company_id = p_company_id and ch.deleted_at is null
  join public.rol_membro_cargos rc on rc.membro_id = m.id
  join public.cargos c on c.id = rc.cargo_id and c.deleted_at is null
  where m.user_id = auth.uid() and m.deleted_at is null
    and public.is_company_member(p_company_id)
  order by c.ordem, c.nome;
$$;

revoke all on function public.meus_cargos(uuid) from public, anon, authenticated;
grant execute on function public.meus_cargos(uuid) to authenticated;

notify pgrst, 'reload schema';
