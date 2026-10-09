-- EBD: as classes aparecem da menor para a maior idade, sem campo para
-- preencher. A posição (ordem) passa a vir da idade mínima; sem idade, a
-- classe vai para o fim. As consultas já desempatam pelo nome, então quem não
-- preenche idade nenhuma vê as classes em ordem alfabética.

create or replace function public.ebd_classe_ordem_pela_idade()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.ordem := coalesce(new.idade_minima, 999);
  return new;
end;
$$;

revoke all on function public.ebd_classe_ordem_pela_idade() from public, anon, authenticated;

drop trigger if exists ebd_classes_ordem_pela_idade on public.ebd_classes;
create trigger ebd_classes_ordem_pela_idade
  before insert or update on public.ebd_classes
  for each row execute function public.ebd_classe_ordem_pela_idade();

-- As classes que já existem.
update public.ebd_classes set ordem = coalesce(idade_minima, 999)
where ordem is distinct from coalesce(idade_minima, 999);
