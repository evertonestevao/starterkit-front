-- ---------------------------------------------------------------------------
-- Cor de destaque da página da igreja
-- ---------------------------------------------------------------------------
-- A igreja escolhe o tema (já existia: template_mode/template_id) e agora
-- também a cor de destaque que vai por cima dele. É conteúdo da PRÓPRIA
-- página da igreja, escrito por quem a administra — não passa por moderação,
-- ao contrário do que o patrocinador põe na página dos outros.
--
-- A cor entra num atributo `style` do HTML público. Por isso o formato é
-- travado aqui, no banco, e não só no formulário: só #rrggbb minúsculo. Nada
-- de `url(...)` ou `;` que abram outra propriedade CSS numa página que a
-- igreja divulga.
--
-- Herança: a cor anda JUNTO com o tema. Quem tem `template_mode = 'inherit'`
-- usa tema E cor da igreja-mãe mais próxima que personalizou; quem escolhe
-- `custom` usa os dele (cor nula = a cor padrão do tema). Assim uma
-- congregação que herda não fica com o tema da sede e a cor errada.

alter table public.churches
  add column if not exists accent_color text;

alter table public.churches
  drop constraint if exists churches_accent_color_valida;
alter table public.churches
  add constraint churches_accent_color_valida
  check (accent_color is null or accent_color ~ '^#[0-9a-f]{6}$');

comment on column public.churches.accent_color is
  'Cor de destaque da página pública (#rrggbb). Só vale com template_mode = custom; nula = cor padrão do tema.';

-- `churches` tem GRANT por COLUNA (20260917180000): coluna nova nasce sem
-- acesso, e a página pública (anon) precisa ler. A escrita é de quem
-- administra a empresa dona, pela policy de update que já existe.
grant select (accent_color) on public.churches to anon;
grant update (accent_color) on public.churches to authenticated;

-- Tema + cor resolvidos pela herança, numa chamada só. SECURITY INVOKER como
-- resolve_template: lê só colunas que o visitante já pode ver.
create or replace function public.resolve_church_appearance(p_church_id uuid)
returns table (template_id uuid, accent_color text)
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_current_id uuid := p_church_id;
  v_parent uuid;
  v_mode text;
  v_template uuid;
  v_accent text;
  v_found boolean;
  v_depth integer := 0;
begin
  loop
    exit when v_current_id is null;

    select c.parent_id, c.template_mode, c.template_id, c.accent_color, true
      into v_parent, v_mode, v_template, v_accent, v_found
    from public.churches c
    where c.id = v_current_id;

    if not coalesce(v_found, false) then
      return;
    end if;
    v_found := false;

    if v_mode = 'custom' and v_template is not null then
      template_id := v_template;
      accent_color := v_accent;
      return next;
      return;
    end if;

    if v_parent is null then
      return;
    end if;

    v_current_id := v_parent;
    v_depth := v_depth + 1;

    if v_depth > 50 then
      return;
    end if;
  end loop;
end;
$fn$;

revoke all on function public.resolve_church_appearance(uuid) from public, anon, authenticated;
grant execute on function public.resolve_church_appearance(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
