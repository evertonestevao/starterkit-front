-- Data de batismo no cadastro do membro (opcional).
-- Grants por coluna: a tabela já tem REVOKE ALL e GRANTs explícitos; só soma esta.
alter table public.rol_membros add column if not exists batismo date;

grant insert (batismo) on public.rol_membros to authenticated;
grant update (batismo) on public.rol_membros to authenticated;

notify pgrst, 'reload schema';
