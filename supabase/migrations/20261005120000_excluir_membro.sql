-- ---------------------------------------------------------------------------
-- Membros: excluir um cadastro feito por engano
-- ---------------------------------------------------------------------------
-- Até aqui só dava para inativar. Um nome duplicado ou digitado errado ficava
-- para sempre na lista de inativos.
--
-- A exclusão é "soft" (deleted_at): o cadastro some das telas e das listas,
-- mas as presenças já registradas continuam no histórico dos cultos. Junto:
-- sai dos cargos, deixa de ser professor e encerra a matrícula na EBD —
-- senão um cadastro excluído seguiria contando como "matriculado".
--
-- Quem tem LOGIN não é excluído por aqui: primeiro quem administra remove o
-- acesso, depois exclui. Assim ninguém perde a conta por um clique de quem
-- só cuida do cadastro.
create or replace function public.excluir_membro(p_membro_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membro public.rol_membros%rowtype;
begin
  select * into v_membro from public.rol_membros where id = p_membro_id and deleted_at is null;
  -- Mesma régua de editar o cadastro (can_acompanhar): outra igreja = não encontrado.
  if v_membro.id is null or not public.can_acompanhar(v_membro.church_id) then
    raise exception 'membro nao encontrado' using errcode = 'P0002';
  end if;
  if v_membro.user_id is not null then
    raise exception 'membro com acesso ao sistema' using errcode = '23514';
  end if;

  delete from public.rol_membro_cargos where membro_id = p_membro_id;
  delete from public.ebd_professores where membro_id = p_membro_id;
  update public.ebd_matriculas
     set ate = greatest(desde, current_date - 1)
   where membro_id = p_membro_id and ate is null;

  update public.rol_membros
     set deleted_at = now(), ativo = false
   where id = p_membro_id;
end;
$$;

revoke all on function public.excluir_membro(uuid) from public, anon, authenticated;
grant execute on function public.excluir_membro(uuid) to authenticated;

notify pgrst, 'reload schema';
