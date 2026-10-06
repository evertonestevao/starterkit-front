-- Apagar uma igreja, empresa ou conta não pode travar nas tabelas novas.
--
-- `rol_membro_fichas` e `rede_nomes_niveis` nasceram com FKs sem regra de
-- exclusão em church_id/company_id/atualizado_por, diferente de rol_membros
-- (ON DELETE CASCADE). Resultado: excluir uma igreja com fichas falhava com
-- violação de chave estrangeira. Aqui elas passam a seguir a mesma regra:
-- a ficha e os nomes vão junto com a igreja; quem alterou vira NULL se a
-- conta for apagada.

alter table public.rol_membro_fichas
  drop constraint rol_membro_fichas_church_id_fkey,
  drop constraint rol_membro_fichas_company_id_fkey,
  drop constraint rol_membro_fichas_atualizado_por_fkey,
  add constraint rol_membro_fichas_church_id_fkey
    foreign key (church_id) references public.churches (id) on delete cascade,
  add constraint rol_membro_fichas_company_id_fkey
    foreign key (company_id) references public.companies (id) on delete cascade,
  add constraint rol_membro_fichas_atualizado_por_fkey
    foreign key (atualizado_por) references auth.users (id) on delete set null;

alter table public.rede_nomes_niveis
  drop constraint rede_nomes_niveis_company_id_fkey,
  drop constraint rede_nomes_niveis_atualizado_por_fkey,
  add constraint rede_nomes_niveis_company_id_fkey
    foreign key (company_id) references public.companies (id) on delete cascade,
  add constraint rede_nomes_niveis_atualizado_por_fkey
    foreign key (atualizado_por) references auth.users (id) on delete set null;
