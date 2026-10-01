-- ---------------------------------------------------------------------------
-- Busca de membros no servidor (lista paginada)
-- ---------------------------------------------------------------------------
-- A lista de Membros passou a ser paginada no banco, então a busca também
-- precisa rodar lá. "antonio" tem que achar "Antônio", como na busca do
-- client (src/lib/search.ts).
--
-- `unaccent` não está instalada e não é IMMUTABLE (não serve em coluna
-- gerada). `translate` com um mapa fixo de acentos do português é, e não
-- pede extensão nova. O client normaliza o termo do mesmo jeito
-- (normalizeSearch) antes do ILIKE.

alter table public.rol_membros
  add column if not exists nome_busca text
  generated always as (
    lower(translate(
      nome,
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    ))
  ) stored;

comment on column public.rol_membros.nome_busca is
  'Nome sem acento e em minúsculas, para busca. Gerada a partir de `nome`.';

-- Coluna gerada não entra em GRANT de insert/update; a leitura vem do
-- GRANT de select da tabela, com a mesma RLS (can_acompanhar).

notify pgrst, 'reload schema';
