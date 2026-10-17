-- Sede/subsede também veem o CARGO de quem já é visível pela migration
-- 20261022100000 (membro de fato + termo assinado) — decisão do Everton
-- durante teste em 2026-10-17.
--
-- `rol_membro_cargos` tinha regra própria, mais restritiva que o resto do
-- cadastro ("cargo de membro é dado pessoal; a igreja de cima não lê",
-- comentário original em 20261001130000_cargos.sql). Mantém a mesma trava
-- para quem NÃO passa em `pode_rede_ver_cadastro` — só estende para quem já
-- passa.
drop policy if exists "rol_membro_cargos_select_own" on public.rol_membro_cargos;
create policy "rol_membro_cargos_select_own" on public.rol_membro_cargos for select to authenticated
  using (public.can_acompanhar(church_id) or public.pode_rede_ver_cadastro(membro_id));

-- Catálogo de cargos (não é dado de pessoa, é a LISTA do que existe): sem
-- isto, o filtro "cargo" da tela de rede vem sempre vazio para quem administra
-- a igreja de cima.
create or replace function public.cargos_visiveis(p_church uuid)
returns table (
  id uuid,
  church_id uuid,
  dono_nome text,
  slug text,
  nome text,
  descricao text,
  unico boolean,
  ordem smallint,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.church_id, dono.name, c.slug, c.nome, c.descricao, c.unico, c.ordem, c.deleted_at
  from public.churches alvo
  join public.cargos c on true
  left join public.churches dono on dono.id = c.church_id
  where alvo.id = p_church
    and alvo.deleted_at is null
    and (public.is_company_member(alvo.company_id) or public.can_admin_view_church(p_church))
    and (c.church_id is null or (dono.deleted_at is null and alvo.path <@ dono.path))
  order by c.ordem, c.nome;
$$;

notify pgrst, 'reload schema';
