-- Bucket de mídia de campanha (capa + foto de feedback).
--
-- Mesmo desenho de church-logos: conteúdo da PRÓPRIA igreja na PRÓPRIA
-- página, sem fila de moderação (diferente de sponsor-logos, que é conteúdo
-- de terceiro). Convenção de path: <campaign_id>/capa.<ext> e
-- <campaign_id>/feedback.<ext> — a primeira pasta é a campanha.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-media',
  'campaign-media',
  true,
  1048576, -- 1MB: mesmo limite de MAX_LOGO_BYTES na aplicação
  -- Sem SVG: em bucket público, um SVG é executável se aberto na origem.
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Quem administra a igreja DONA da campanha pode escrever o arquivo dela.
create or replace function public.can_manage_campaign_files(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id
      and c.deleted_at is null
      and c.company_id is not null
      and public.is_company_admin(c.company_id)
  );
$$;

revoke all on function public.can_manage_campaign_files(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_campaign_files(uuid) to authenticated;

-- `split_part(...)::uuid` estoura se a pasta não for um uuid; o CASE (dentro
-- do can_manage_campaign_files) evita o erro e simplesmente nega.
drop policy if exists "campaign_media_insert_admin" on storage.objects;
create policy "campaign_media_insert_admin"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campaign-media'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.can_manage_campaign_files(split_part(name, '/', 1)::uuid)
  );

drop policy if exists "campaign_media_update_admin" on storage.objects;
create policy "campaign_media_update_admin"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'campaign-media'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.can_manage_campaign_files(split_part(name, '/', 1)::uuid)
  )
  with check (
    bucket_id = 'campaign-media'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.can_manage_campaign_files(split_part(name, '/', 1)::uuid)
  );

drop policy if exists "campaign_media_delete_admin" on storage.objects;
create policy "campaign_media_delete_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'campaign-media'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.can_manage_campaign_files(split_part(name, '/', 1)::uuid)
  );

drop policy if exists "campaign_media_select_admin" on storage.objects;
create policy "campaign_media_select_admin"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'campaign-media'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and public.can_manage_campaign_files(split_part(name, '/', 1)::uuid)
  );

notify pgrst, 'reload schema';
