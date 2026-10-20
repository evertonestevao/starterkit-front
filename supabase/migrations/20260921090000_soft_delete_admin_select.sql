-- ---------------------------------------------------------------------------
-- Remover (soft delete) programação e evento voltou a funcionar
-- ---------------------------------------------------------------------------
-- O sintoma: "new row violates row-level security policy" ao remover um item
-- da programação pelo painel.
--
-- A causa: no Postgres, um UPDATE com WHERE precisa de SELECT, e aí a linha
-- RESULTANTE também tem que passar nas policies de SELECT. A única policy de
-- leitura de church_schedule e church_events é a pública, `deleted_at is
-- null` — justamente o que a remoção desliga. A linha "some" no meio do
-- próprio UPDATE e o banco recusa.
--
-- A correção: o admin da igreja também LÊ as linhas removidas da própria
-- empresa. A página pública não muda (anon segue só com `deleted_at is null`),
-- e nenhum outro tenant ganha nada.

drop policy if exists "church_schedule_select_admin" on public.church_schedule;
create policy "church_schedule_select_admin"
  on public.church_schedule for select
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id));

drop policy if exists "church_events_select_admin" on public.church_events;
create policy "church_events_select_admin"
  on public.church_events for select
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id));
