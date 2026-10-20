-- ---------------------------------------------------------------------------
-- Bucket dos logos de patrocinador
-- ---------------------------------------------------------------------------
-- Duas pastas com regras diferentes, porque são dois momentos diferentes:
--
--   pendente/<user_id>/<uuid>.<ext>   — o que a pessoa acabou de enviar
--   publico/<sponsor_account_id>/...  — o que a moderação aprovou
--
-- O patrocinador escreve só na pasta `pendente` dele. Em `publico` ninguém
-- escreve pelo client: quem move o arquivo é o servidor, com service_role, no
-- momento da aprovação. Sem isso, bastaria subir direto para `publico` para
-- pular a moderação inteira.
--
-- Bucket público na LEITURA porque a página da igreja é pública e cacheada —
-- URL assinada por render não se paga aqui. O arquivo pendente fica
-- alcançável por quem souber a URL, o que é aceitável: é o logo que a própria
-- pessoa enviou, e nada aponta para ele além do painel da moderação.
--
-- SVG fica de fora do allowlist de propósito: é executável quando aberto
-- direto na origem do storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sponsor-logos',
  'sponsor-logos',
  true,
  1048576, -- 1MB: mesmo teto validado na aplicação, reforçado aqui
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- INSERT: só em pendente/<seu id>/...
drop policy if exists "sponsor_logos_insert_own_pending" on storage.objects;
create policy "sponsor_logos_insert_own_pending"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sponsor-logos'
    and split_part(name, '/', 1) = 'pendente'
    and split_part(name, '/', 2) = auth.uid()::text
  );

-- UPDATE (upsert) e DELETE: mesma pasta, nunca a pasta pública.
drop policy if exists "sponsor_logos_update_own_pending" on storage.objects;
create policy "sponsor_logos_update_own_pending"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'sponsor-logos'
    and split_part(name, '/', 1) = 'pendente'
    and split_part(name, '/', 2) = auth.uid()::text
  )
  with check (
    bucket_id = 'sponsor-logos'
    and split_part(name, '/', 1) = 'pendente'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "sponsor_logos_delete_own_pending" on storage.objects;
create policy "sponsor_logos_delete_own_pending"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sponsor-logos'
    and split_part(name, '/', 1) = 'pendente'
    and split_part(name, '/', 2) = auth.uid()::text
  );

-- SELECT autenticado só da própria pasta pendente (listagem via API; a
-- leitura do arquivo em si sai pelo endpoint público do bucket).
drop policy if exists "sponsor_logos_select_own_pending" on storage.objects;
create policy "sponsor_logos_select_own_pending"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'sponsor-logos'
    and split_part(name, '/', 1) = 'pendente'
    and split_part(name, '/', 2) = auth.uid()::text
  );
