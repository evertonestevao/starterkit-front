-- Usuário logado só enxerga igreja que é dele — ou que está ABAIXO de uma dele.
--
-- Antes: `churches_public_select` deixava qualquer conta logada ler TODAS as
-- igrejas, com todas as colunas (inclusive Pix ainda em análise, dados do
-- domínio próprio, a que conta pertence e páginas que nunca foram publicadas).
-- Criar conta é livre, então isso equivalia a expor a base de clientes.
--
-- Agora:
--   logado  → as igrejas das contas de que faz parte, e as que estão abaixo
--             delas na rede (a de cima vê as de baixo; nunca o contrário, e
--             nunca outra rede);
--   anônimo → só páginas que estão no ar, e só as colunas públicas (os GRANTs
--             por coluna que já existiam).
--
-- O que precisa atravessar essa regra passa por funções estreitas, que
-- devolvem apenas o que já é público na página da igreja:
--   igreja_publica(chave)   a página pública (ou a prévia, para quem administra)
--   igrejas_resumo(ids)     nome e endereço de igrejas no ar ou da própria rede
--                           (a igreja superior, a igreja que o patrocinador apoia)
--   rede_tem_igrejas(id)    se a sede tem igrejas ligadas, para o atalho da página

-- ---------------------------------------------------------------------------
-- 1. Os caminhos (ltree) das igrejas de quem está logado
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: a policy de `churches` não pode consultar `churches` (seria
-- recursão), e aqui a leitura é só das igrejas das contas do próprio usuário.
create or replace function public.meus_caminhos_de_igreja()
returns ltree[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(c.path), '{}'::ltree[])
  from public.churches c
  join public.company_members cm on cm.company_id = c.company_id
  where cm.user_id = auth.uid()
    and cm.deleted_at is null
    and c.deleted_at is null;
$$;

revoke all on function public.meus_caminhos_de_igreja() from public, anon, authenticated;
grant execute on function public.meus_caminhos_de_igreja() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. As policies de leitura
-- ---------------------------------------------------------------------------
drop policy if exists "churches_public_select" on public.churches;

create policy "churches_select_publica" on public.churches
  for select to anon
  using (deleted_at is null and pagina_ativa);

-- `path <@ algum dos meus` cobre a própria igreja e todas as de baixo dela.
-- O (select ...) faz o Postgres calcular a lista uma vez por consulta.
create policy "churches_select_da_rede" on public.churches
  for select to authenticated
  using (deleted_at is null and path <@ (select public.meus_caminhos_de_igreja()));

-- ---------------------------------------------------------------------------
-- 3. Aparência herdada: sobe a árvore até a igreja que personalizou
-- ---------------------------------------------------------------------------
-- A filial não lê mais a linha da igreja de cima; a função devolve só o tema e
-- a cor, que são o que a página pública mostra.
alter function public.resolve_church_appearance(uuid) security definer;
alter function public.resolve_template(uuid) security definer;

-- Gatilhos e auxiliares de `churches` que precisam olhar a rede INTEIRA, e nao
-- so o que quem esta editando enxerga. Rodando com a permissao de quem edita,
-- a filial nao acharia a igreja de cima (o caminho na arvore sairia errado) e
-- a checagem de codigo livre ignoraria as igrejas das outras contas.
alter function public.sync_church_path() security definer;
alter function public.check_church_children_tipo() security definer;
alter function public.next_available_church_slug(text) security definer;
revoke all on function public.sync_church_path() from public, anon, authenticated;
revoke all on function public.check_church_children_tipo() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. A página pública
-- ---------------------------------------------------------------------------
-- Uma igreja pela chave, com as colunas que a página usa. Devolve a linha se a
-- página está no ar; fora do ar, só para quem administra a igreja (`previa`).
-- A chave Pix não vem daqui: sai de pix_publico(), que exige aprovação.
create or replace function public.igreja_publica(p_chave text)
returns table (
  id uuid,
  parent_id uuid,
  name text,
  sobrenome text,
  slug text,
  logo_url text,
  address text,
  sobre text,
  service_times jsonb,
  social_links jsonb,
  path text,
  template_mode text,
  template_id uuid,
  public_code text,
  pagina_ativa boolean,
  pix_fonte text,
  aceita_patrocinio boolean,
  created_at timestamptz,
  updated_at timestamptz,
  tem_dono boolean,
  previa boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.parent_id, c.name, c.sobrenome, c.slug, c.logo_url, c.address, c.sobre,
         c.service_times, c.social_links, c.path::text, c.template_mode, c.template_id, c.public_code,
         c.pagina_ativa, c.pix_fonte, c.aceita_patrocinio, c.created_at, c.updated_at,
         c.company_id is not null,
         not c.pagina_ativa
  from public.churches c
  where c.public_code = p_chave
    and c.deleted_at is null
    and (c.pagina_ativa or (c.company_id is not null and public.is_company_admin(c.company_id)));
$$;

-- Nome e endereço de igrejas, pelo id. Só devolve as que estão no ar, ou as da
-- rede de quem pede (as dele, as de baixo e as de cima — a filial precisa do
-- nome da igreja superior para a tela de vínculos e para herdar o nome).
-- Também as igrejas com quem a pessoa tem um pedido de vínculo.
create or replace function public.igrejas_resumo(p_ids uuid[])
returns table (
  id uuid,
  parent_id uuid,
  name text,
  sobrenome text,
  tipo text,
  public_code text,
  address text,
  logo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  with meus as (select public.meus_caminhos_de_igreja() as caminhos)
  select c.id, c.parent_id, c.name, c.sobrenome, c.tipo, c.public_code, c.address, c.logo_url
  from public.churches c, meus
  where c.id = any(p_ids)
    and c.deleted_at is null
    and (
      c.pagina_ativa
      or c.path <@ meus.caminhos
      or exists (select 1 from unnest(meus.caminhos) m where m <@ c.path)
      -- As duas partes de um pedido de vínculo se identificam: quem recebe
      -- precisa saber quem está pedindo (e vice-versa), mesmo antes de a
      -- página da outra estar no ar.
      or exists (
        select 1 from public.church_link_requests r
        where (r.child_church_id = c.id and public.is_company_member(r.parent_company_id))
           or (r.parent_church_id = c.id and public.is_company_member(r.child_company_id))
      )
    )
  limit 2000;
$$;

-- A sede tem alguma igreja com a página no ar ligada a ela?
create or replace function public.rede_tem_igrejas(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.churches s
    join public.churches c on c.path <@ s.path and c.id <> s.id
    where s.id = p_church_id and s.parent_id is null and s.deleted_at is null
      and c.deleted_at is null and c.pagina_ativa
  );
$$;

-- A moderação gera o QR de qualquer igreja: precisa só da chave da página.
create or replace function public.platform_church_public_code(p_church_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.public_code from public.churches c
  where c.id = p_church_id and c.deleted_at is null and public.is_platform_staff();
$$;

revoke all on function public.igreja_publica(text) from public, anon, authenticated;
revoke all on function public.igrejas_resumo(uuid[]) from public, anon, authenticated;
revoke all on function public.rede_tem_igrejas(uuid) from public, anon, authenticated;
revoke all on function public.platform_church_public_code(uuid) from public, anon, authenticated;
grant execute on function public.igreja_publica(text) to anon, authenticated;
grant execute on function public.igrejas_resumo(uuid[]) to anon, authenticated;
grant execute on function public.rede_tem_igrejas(uuid) to anon, authenticated;
grant execute on function public.platform_church_public_code(uuid) to authenticated;

notify pgrst, 'reload schema';
