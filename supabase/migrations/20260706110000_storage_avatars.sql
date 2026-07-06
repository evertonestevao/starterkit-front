-- Bucket de avatares (Supabase Storage) + policies de acesso.
-- Convenção de path: <user_id>/avatar.<ext> — a primeira pasta é o dono.
-- Bucket público: LEITURA aberta via URL pública (avatar não é dado sensível);
-- escrita só do próprio usuário, na própria pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB: mesmo limite validado na aplicação, reforçado no storage
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- storage.objects já tem RLS ativa por padrão no Supabase; sem policy nada
-- passa. Cada policy abaixo restringe ao bucket 'avatars' e à pasta do
-- próprio usuário (split_part(name,'/',1) = uid).

-- INSERT: usuário só cria objeto na própria pasta.
create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- UPDATE: trocar o próprio avatar (upload com upsert faz UPDATE).
create policy "avatars_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- DELETE: remover o próprio avatar.
create policy "avatars_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- SELECT autenticado (listagem via API; a leitura pública do arquivo em si
-- já é servida pelo endpoint público do bucket).
create policy "avatars_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );
