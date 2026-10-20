-- Endereço da igreja em partes (CEP, rua, número, complemento, bairro,
-- cidade, UF), para a tela buscar pelo CEP e a pessoa só completar o número.
--
-- `address` continua existindo e continua sendo o que a página pública, o
-- "Como chegar" e as listas mostram: o serviço monta a linha a partir das
-- partes ao salvar. Igrejas antigas ficam só com `address` até alguém editar.

alter table public.churches
  add column if not exists cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  add column if not exists logradouro text check (logradouro is null or char_length(logradouro) <= 150),
  add column if not exists numero text check (numero is null or char_length(numero) <= 20),
  add column if not exists complemento text check (complemento is null or char_length(complemento) <= 80),
  add column if not exists bairro text check (bairro is null or char_length(bairro) <= 80),
  add column if not exists cidade text check (cidade is null or char_length(cidade) <= 80),
  add column if not exists uf text check (uf is null or uf ~ '^[A-Z]{2}$');

-- `churches` tem GRANTs por coluna: escrever é de quem administra (policy
-- churches_update_company_admin). O anon não lê as partes: o que é público
-- já está em `address`. O authenticated lê pela permissão de tabela inteira.
grant update (cep, logradouro, numero, complemento, bairro, cidade, uf) on public.churches to authenticated;
