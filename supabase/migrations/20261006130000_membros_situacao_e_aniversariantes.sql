-- Situação do membro na própria lista + aniversariantes do mês.
--
-- 1. `rol_membros.situacao` é um ESPELHO da situação da ficha
--    (rol_membro_fichas), para a lista de membros filtrar e mostrar
--    "Transferido", "Falecido"... sem depender da ficha, que tem dados
--    pessoais e só o módulo Membros lê. Data e motivo continuam só na ficha.
--    Ninguém escreve a coluna direto: dois gatilhos a mantêm.
-- 2. `aniversariantes_do_mes`: nascimento, batismo e casamento do mês.

-- ---------------------------------------------------------------------------
-- 1. Espelho da situação
-- ---------------------------------------------------------------------------
alter table public.rol_membros
  add column if not exists situacao text not null default 'ativo'
  check (situacao in ('ativo', 'afastado', 'transferido', 'desligado', 'falecido'));

-- Quem já tem ficha usa a dela; os demais seguem o "ativo" (inativo = afastado).
update public.rol_membros m
   set situacao = coalesce(
     (select f.situacao from public.rol_membro_fichas f where f.membro_id = m.id and f.deleted_at is null),
     case when m.ativo then 'ativo' else 'afastado' end
   );

create index if not exists rol_membros_church_situacao_idx
  on public.rol_membros (church_id, situacao) where deleted_at is null;

-- Sem GRANT de insert/update na coluna para `authenticated`: só os gatilhos mexem.

-- Cadastro novo, ou "Ativo" marcado/desmarcado no cadastro rápido.
create or replace function public.rol_membros_situacao_do_ativo()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.situacao := case when new.ativo then 'ativo' else 'afastado' end;
  elsif new.ativo and new.situacao <> 'ativo' then
    new.situacao := 'ativo';
  elsif not new.ativo and new.situacao = 'ativo' then
    new.situacao := 'afastado';
  end if;
  return new;
end;
$$;

create trigger rol_membros_situacao_do_ativo
  before insert or update of ativo on public.rol_membros
  for each row
  execute function public.rol_membros_situacao_do_ativo();

-- A ficha mudou de situação: a lista acompanha.
create or replace function public.rol_membro_fichas_espelha_situacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rol_membros
     set situacao = new.situacao
   where id = new.membro_id and situacao is distinct from new.situacao;
  return null;
end;
$$;

revoke all on function public.rol_membro_fichas_espelha_situacao() from public, anon, authenticated;

create trigger rol_membro_fichas_espelha_situacao
  after insert or update of situacao on public.rol_membro_fichas
  for each row
  execute function public.rol_membro_fichas_espelha_situacao();

-- ---------------------------------------------------------------------------
-- 2. Aniversariantes do mês
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER de propósito: vale a RLS de quem chama. Quem só faz a
-- chamada vê nascimento e batismo (estão em rol_membros); casamento vem da
-- ficha e só aparece para quem tem o módulo Membros. Só pessoas ativas.
create or replace function public.aniversariantes_do_mes(p_church_id uuid, p_mes int)
returns table (
  membro_id uuid,
  nome text,
  whatsapp text,
  tipo text,
  data date,
  conjuge_nome text
)
language sql
stable
security invoker
set search_path = public
as $$
  select m.id, m.nome, m.whatsapp, 'nascimento', m.nascimento, null::text
  from public.rol_membros m
  where m.church_id = p_church_id and m.deleted_at is null and m.ativo
    and m.nascimento is not null and extract(month from m.nascimento) = p_mes
  union all
  select m.id, m.nome, m.whatsapp, 'batismo', m.batismo, null::text
  from public.rol_membros m
  where m.church_id = p_church_id and m.deleted_at is null and m.ativo
    and m.batismo is not null and extract(month from m.batismo) = p_mes
  union all
  select m.id, m.nome, m.whatsapp, 'casamento', f.data_casamento, f.conjuge_nome
  from public.rol_membro_fichas f
  join public.rol_membros m on m.id = f.membro_id
  where f.church_id = p_church_id and f.deleted_at is null
    and m.deleted_at is null and m.ativo
    and f.data_casamento is not null and extract(month from f.data_casamento) = p_mes;
$$;

revoke all on function public.aniversariantes_do_mes(uuid, int) from public, anon, authenticated;
grant execute on function public.aniversariantes_do_mes(uuid, int) to authenticated;

notify pgrst, 'reload schema';
