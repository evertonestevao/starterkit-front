-- ---------------------------------------------------------------------------
-- A igreja passa a cuidar da própria página
-- ---------------------------------------------------------------------------
-- Até aqui nome, endereço, logo e redes sociais só entravam por SQL: as
-- colunas já tinham GRANT de update para o admin da empresa (migration
-- 20260916120000), mas não existia tela. Faltava também o ENDEREÇO PÚBLICO
-- (`public_code`), que é o que vai impresso no QR Code e gravado na tag NFC —
-- ele era derivado do slug da empresa e ninguém podia escolher.
--
-- Esta migration prepara o banco para essa tela e faz a limpeza que ficou
-- pendente desde o começo do projeto.

-- ---------------------------------------------------------------------------
-- 1. Fora as igrejas de demonstração
-- ---------------------------------------------------------------------------
-- A migration do core semeia quatro igrejas sem empresa dona. Em produção
-- elas ficam PÚBLICAS em /igreja/betel e companhia, com endereço e horário
-- inventados, e ninguém consegue editá-las ou tirá-las do ar pela aplicação
-- (sem dono, nenhuma policy alcança). Saem agora.
delete from public.churches where company_id is null;

-- Com elas fora, a coluna finalmente pode ser o que sempre quis ser. O
-- comentário da migration 20260916120000 já prometia este dia: igreja sem
-- dono não deveria existir, e várias funções carregam `company_id is not
-- null` só por causa das linhas de demonstração.
alter table public.churches alter column company_id set not null;

-- ---------------------------------------------------------------------------
-- 2. Endereço público escolhido pela igreja
-- ---------------------------------------------------------------------------
-- Formato conferido no banco porque este texto vira URL: um espaço ou uma
-- barra aqui quebraria o link impresso no material da igreja.
alter table public.churches
  add constraint churches_public_code_formato check (
    public_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(public_code) between 3 and 40
  );

-- A coluna entra no GRANT por coluna; a policy `churches_update_company_admin`
-- já limita a quem administra a empresa dona.
grant update (public_code) on public.churches to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Logo da igreja
-- ---------------------------------------------------------------------------
-- Bucket próprio, separado de `avatars` (pessoa) e de `sponsor-logos`
-- (conteúdo de terceiro, que passa por moderação). O logo da igreja é
-- conteúdo da PRÓPRIA igreja na PRÓPRIA página: quem administra publica
-- direto, sem fila.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'church-logos',
  'church-logos',
  true,
  1048576, -- 1MB: mesmo limite de MAX_LOGO_BYTES na aplicação
  -- Sem SVG: em bucket público, um SVG é executável se aberto na origem.
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Quem pode escrever arquivo DESTA igreja. Deliberadamente NÃO é
-- `can_admin_view_church`: aquela desce a árvore, e a sede não deve trocar o
-- logo da congregação por cima dela. Aqui é só a empresa dona.
create or replace function public.can_manage_church_files(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.churches c
    where c.id = p_church_id
      and c.deleted_at is null
      and public.is_company_admin(c.company_id)
  );
$$;

revoke all on function public.can_manage_church_files(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_church_files(uuid) to authenticated;

-- Convenção de path: <church_id>/logo.<ext> — a primeira pasta é a igreja.
-- `split_part(...)::uuid` estoura se a pasta não for um uuid; o CASE evita o
-- erro e simplesmente nega.
drop policy if exists "church_logos_insert_admin" on storage.objects;
create policy "church_logos_insert_admin"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'church-logos'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.can_manage_church_files(split_part(name, '/', 1)::uuid)
  );

drop policy if exists "church_logos_update_admin" on storage.objects;
create policy "church_logos_update_admin"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'church-logos'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.can_manage_church_files(split_part(name, '/', 1)::uuid)
  )
  with check (
    bucket_id = 'church-logos'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.can_manage_church_files(split_part(name, '/', 1)::uuid)
  );

drop policy if exists "church_logos_delete_admin" on storage.objects;
create policy "church_logos_delete_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'church-logos'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.can_manage_church_files(split_part(name, '/', 1)::uuid)
  );

drop policy if exists "church_logos_select_admin" on storage.objects;
create policy "church_logos_select_admin"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'church-logos'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.can_manage_church_files(split_part(name, '/', 1)::uuid)
  );

notify pgrst, 'reload schema';
