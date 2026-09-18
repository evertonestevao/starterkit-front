-- ---------------------------------------------------------------------------
-- Dízimos e ofertas: chave PIX da igreja na página pública
-- ---------------------------------------------------------------------------
-- A plataforma NÃO movimenta esse dinheiro: a página só mostra a chave da
-- própria igreja, e a doação vai direto do banco de quem doa para o da
-- igreja. Nada de intermediação, taxa ou repasse.
--
-- O titular vai junto de propósito: o app do banco mostra o nome de quem vai
-- receber antes de confirmar, e é comparando os dois que quem doa percebe
-- uma chave trocada. Sem o titular na página, não há o que comparar.
--
-- ATENÇÃO para quando existir a tela de edição: esta é a coluna mais valiosa
-- da tabela para um golpista. Quem invadir a conta de uma igreja e trocar a
-- chave desvia as doações sem ninguém notar. A troca precisa, no mínimo,
-- avisar o dono da conta por email.
alter table public.churches
  add column if not exists pix_chave text
    check (pix_chave is null or char_length(pix_chave) between 5 and 140),
  add column if not exists pix_titular text
    check (pix_titular is null or char_length(pix_titular) between 3 and 140);

comment on column public.churches.pix_chave is
  'Chave PIX da própria igreja para dízimos e ofertas. A plataforma não intermedeia.';
comment on column public.churches.pix_titular is
  'Nome do titular da chave, exibido para quem doa conferir no app do banco.';

-- O anon lê colunas específicas de churches (migration 20260916120000); as
-- duas novas entram na lista porque são públicas por natureza — a igreja as
-- divulga para receber.
grant select (pix_chave, pix_titular) on public.churches to anon;

notify pgrst, 'reload schema';
