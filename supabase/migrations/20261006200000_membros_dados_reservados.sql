-- Quem só faz a chamada vê a lista (nome, situação, telefone), mas não os
-- dados reservados do membro.
--
-- `rol_membros` é lida por quem tem o módulo "acompanhamento" (a chamada) OU
-- o módulo "membros" — a policy `can_acompanhar` aceita os dois, e precisa:
-- sem a lista de nomes não há chamada, e sem o telefone não há como falar com
-- quem está faltando. Só que a leitura era da linha inteira: quem marcava
-- presença também lia nascimento, batismo, e-mail, observações e os cuidados
-- (alergias, medicação — dado de saúde).
--
-- Agora essas cinco colunas saem da leitura direta da tabela e passam a vir
-- por uma visão que só responde a quem tem o módulo Membros (ou administra a
-- igreja). O professor da EBD continua recebendo os cuidados dos alunos da
-- classe dele pelas funções próprias da EBD, que não passam por aqui.

-- ---------------------------------------------------------------------------
-- 1. Leitura da tabela: só as colunas que a chamada usa
-- ---------------------------------------------------------------------------
revoke select on public.rol_membros from authenticated;
grant select (
  id, church_id, company_id, nome, nome_busca, whatsapp, ativo, situacao,
  participa_chamada, membro_igreja, user_id, convidado_em,
  deleted_at, created_at, updated_at
) on public.rol_membros to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Os dados reservados, só para quem tem o módulo Membros
-- ---------------------------------------------------------------------------
-- A visão roda com a permissão do dono (lê as colunas que o client não lê
-- mais) e o filtro `tem_acesso(..., 'membros')` é a regra de quem pode.
-- `security_barrier` impede que uma condição do pedido rode antes desse filtro.
create view public.rol_membros_reservado
with (security_barrier = true) as
  select m.id, m.church_id, m.email, m.nascimento, m.batismo, m.observacoes, m.cuidados
  from public.rol_membros m
  where m.deleted_at is null
    and public.tem_acesso(m.company_id, 'membros');

-- Visão nova também nasce com ALL para anon/authenticated.
revoke all on public.rol_membros_reservado from public, anon, authenticated;
grant select on public.rol_membros_reservado to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Funções que liam essas colunas com a permissão de quem chamava
-- ---------------------------------------------------------------------------
-- Aniversariantes: usa nascimento e batismo. Passa a conferir o módulo Membros
-- por conta própria (a tela já ficava dentro de Membros).
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
security definer
set search_path = public
as $$
  with igreja as (
    select c.id from public.churches c
    where c.id = p_church_id and c.deleted_at is null
      and c.company_id is not null and public.tem_acesso(c.company_id, 'membros')
  )
  select m.id, m.nome, m.whatsapp, 'nascimento', m.nascimento, null::text
  from public.rol_membros m join igreja on igreja.id = m.church_id
  where m.deleted_at is null and m.ativo
    and m.nascimento is not null and extract(month from m.nascimento) = p_mes
  union all
  select m.id, m.nome, m.whatsapp, 'batismo', m.batismo, null::text
  from public.rol_membros m join igreja on igreja.id = m.church_id
  where m.deleted_at is null and m.ativo
    and m.batismo is not null and extract(month from m.batismo) = p_mes
  union all
  select m.id, m.nome, m.whatsapp, 'casamento', f.data_casamento, f.conjuge_nome
  from public.rol_membro_fichas f
  join igreja on igreja.id = f.church_id
  join public.rol_membros m on m.id = f.membro_id
  where f.deleted_at is null and m.deleted_at is null and m.ativo
    and f.data_casamento is not null and extract(month from f.data_casamento) = p_mes;
$$;

revoke all on function public.aniversariantes_do_mes(uuid, int) from public, anon, authenticated;
grant execute on function public.aniversariantes_do_mes(uuid, int) to authenticated;

-- Indicadores de Membros: contam aniversariantes pelo nascimento. Mesma conta
-- de antes; a guarda (quem acompanha esta igreja) agora é explícita, porque a
-- função deixa de depender da RLS de quem chama.
create or replace function public.membros_kpis(p_church_id uuid)
returns table (
  ativos integer,
  inativos integer,
  nao_membros integer,
  novos_no_mes integer,
  aniversariantes_do_mes integer,
  com_cargo integer,
  presenca_media numeric,
  em_alerta integer
)
language sql
stable
security definer
set search_path = public
as $$
  with rol as (
    select m.id, m.ativo, m.created_at, m.nascimento, m.membro_igreja
    from public.rol_membros m
    where m.church_id = p_church_id and m.deleted_at is null
  ),
  presenca as (
    select count(*) filter (where e.estado = 'presente') as p,
           count(*) filter (where e.estado in ('presente', 'ausente')) as base
    from public.acompanhamento_presencas_efetivas e
    join rol on rol.id = e.membro_id and rol.ativo
    where e.church_id = p_church_id and e.data >= current_date - 56
  )
  select
    (select count(*) from rol where ativo and membro_igreja)::int,
    (select count(*) from rol where not ativo and membro_igreja)::int,
    (select count(*) from rol where ativo and not membro_igreja)::int,
    (select count(*) from rol where membro_igreja
      and date_trunc('month', created_at at time zone 'America/Sao_Paulo')
        = date_trunc('month', now() at time zone 'America/Sao_Paulo'))::int,
    (select count(*) from rol
      where ativo and extract(month from nascimento) = extract(month from now() at time zone 'America/Sao_Paulo'))::int,
    (select count(distinct rc.membro_id) from public.rol_membro_cargos rc
      join rol on rol.id = rc.membro_id and rol.ativo
      where rc.church_id = p_church_id)::int,
    (select round(100.0 * p / nullif(base, 0), 1) from presenca),
    (select count(*) from public.acompanhamento_alertas(p_church_id))::int
  where public.can_acompanhar(p_church_id);
$$;

revoke all on function public.membros_kpis(uuid) from public, anon, authenticated;
grant execute on function public.membros_kpis(uuid) to authenticated;

notify pgrst, 'reload schema';
