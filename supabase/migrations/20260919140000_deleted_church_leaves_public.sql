-- ---------------------------------------------------------------------------
-- Igreja excluída sai do ar
-- ---------------------------------------------------------------------------
-- A policy de leitura pública de `churches` era `using (true)`, e a página
-- /t/<código> buscava a igreja sem olhar `deleted_at`. Resultado: uma igreja
-- excluída (soft delete, como manda a regra do projeto) continuava com a
-- página pública no ar indefinidamente. Os Termos das igrejas prometem o
-- contrário — "encerrada a conta, a página pública sai do ar" (cláusula 10.3).
--
-- O acesso por domínio próprio já filtrava (resolve_church_by_domain); o
-- vazamento era só pelo endereço padrão.

drop policy if exists "churches_public_select" on public.churches;

create policy "churches_public_select"
  on public.churches
  for select
  to anon, authenticated
  using (deleted_at is null);
