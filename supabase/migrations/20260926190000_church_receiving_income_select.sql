-- Esqueci de liberar a LEITURA de renda_mensal_cents na migration anterior
-- (só tinha insert/update) — GRANT por coluna precisa ser reemitido pra cada
-- operação, mesmo já tendo grant na tabela toda. Sem isso, listar o
-- recebimento quebrava pra todo mundo, não só pra quem tem o campo novo.
grant select (renda_mensal_cents) on public.church_payment_accounts to authenticated;

notify pgrst, 'reload schema';
