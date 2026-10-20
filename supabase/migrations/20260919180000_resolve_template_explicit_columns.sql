-- ---------------------------------------------------------------------------
-- O tema escolhido pela igreja volta a valer na página pública
-- ---------------------------------------------------------------------------
-- resolve_template fazia `select *` em churches. Desde a migration
-- 20260916120000 o anon tem SELECT só em colunas específicas (as de domínio
-- próprio ficam de fora), e `select *` passou a falhar com permission denied
-- para quem visita sem login — que é todo mundo na página pública. A página
-- tratava o erro como "sem tema" e caía no padrão: toda igreja aparecia no
-- tema escuro, qualquer que fosse a escolha dela.
--
-- A função passa a ler só as quatro colunas de que precisa, todas no GRANT
-- do anon. Segue SECURITY INVOKER: não precisa enxergar nada além do que o
-- visitante já pode ver.
create or replace function public.resolve_template(p_church_id uuid)
returns uuid
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_current_id uuid := p_church_id;
  v_parent uuid;
  v_mode text;
  v_template uuid;
  v_found boolean;
  v_depth integer := 0;
begin
  loop
    exit when v_current_id is null;

    select c.parent_id, c.template_mode, c.template_id, true
      into v_parent, v_mode, v_template, v_found
    from public.churches c
    where c.id = v_current_id;

    if not coalesce(v_found, false) then
      return null;
    end if;
    v_found := false;

    if v_mode = 'custom' and v_template is not null then
      return v_template;
    end if;

    if v_parent is null then
      return null;
    end if;

    v_current_id := v_parent;
    v_depth := v_depth + 1;

    if v_depth > 50 then
      return null;
    end if;
  end loop;

  return null;
end;
$fn$;
