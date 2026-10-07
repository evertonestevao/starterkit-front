-- Saudação das mensagens, por igreja.
--
-- As mensagens prontas de WhatsApp e o e-mail de convite começavam sempre com
-- "A paz do Senhor". Cada tradição saúda de um jeito ("Graça e paz", "Paz e
-- bem", "Olá"): a igreja escolhe a dela. Sem valor = o padrão, que fica no
-- código (src/lib/saudacao.ts).

alter table public.churches
  add column if not exists saudacao text
  check (saudacao is null or char_length(saudacao) between 2 and 40);

-- A tabela tem GRANTs de UPDATE por coluna; quem pode alterar a linha é a
-- policy já existente (churches_update_company_admin: owner/admin da empresa).
grant update (saudacao) on public.churches to authenticated;

notify pgrst, 'reload schema';
