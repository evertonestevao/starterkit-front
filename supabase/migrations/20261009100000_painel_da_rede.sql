-- Painel da rede: a saúde das igrejas de baixo, para a igreja de cima.
--
-- A sede enxerga todas as unidades abaixo dela; a subsede, as congregações
-- ligadas a ela. Até aqui isso existia em dois quadros soltos (presença nos
-- cultos e EBD). Este painel junta o que importa numa tela só, com séries no
-- tempo para os gráficos.
--
-- O que sobe para a igreja de cima são NÚMEROS, nunca pessoas:
--   * membros (quantos, quantos novos), presença em cultos e na EBD,
--     visitantes, pedidos de visita em aberto, próximos eventos;
--   * tesouraria: só o TOTAL do mês de dízimos e de ofertas de cada unidade.
--     Nome de quem entregou, culto e lançamento continuam só da própria
--     igreja (a tabela segue fechada para a de cima);
--   * mensalidade da unidade (em dia, pendente, suspensa): só para o
--     RESPONSÁVEL da igreja de cima — a situação financeira de uma igreja não
--     é assunto de todo administrador da outra.
-- Pedidos de oração ficam de fora, nem em número.
--
-- Quem pode chamar: quem ADMINISTRA a empresa informada. As unidades são as
-- igrejas abaixo das igrejas dessa empresa na árvore (`churches.path`), então
-- passar a empresa de outra rede não devolve nada.

-- As unidades abaixo das igrejas de uma empresa. SEM checar quem pergunta:
-- não é chamável de fora, só pelas funções abaixo.
create or replace function public.rede_unidades_abaixo(p_company_id uuid)
returns table (
  church_id uuid,
  church_name text,
  tipo text,
  parent_id uuid,
  path ltree,
  nivel int,
  company_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  -- Com mais de uma igreja da empresa acima da unidade, vale a mais alta.
  select distinct on (d.id)
         d.id, d.name, d.tipo, d.parent_id, d.path, nlevel(d.path) - nlevel(r.path), d.company_id
  from public.churches r
  join public.churches d on d.path <@ r.path and d.id <> r.id and d.deleted_at is null
  where r.company_id = p_company_id
    and r.deleted_at is null
  order by d.id, nlevel(r.path);
$$;

revoke all on function public.rede_unidades_abaixo(uuid) from public, anon, authenticated;

-- Há unidades abaixo? Decide se o item "Rede" aparece no menu.
create or replace function public.rede_tem_unidades(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_company_admin(p_company_id)
     and exists (select 1 from public.rede_unidades_abaixo(p_company_id));
$$;

revoke all on function public.rede_tem_unidades(uuid) from public, anon, authenticated;
grant execute on function public.rede_tem_unidades(uuid) to authenticated;

-- Uma linha por unidade, com o retrato de hoje.
create or replace function public.rede_painel_unidades(p_company_id uuid)
returns table (
  church_id uuid,
  church_name text,
  tipo text,
  parent_id uuid,
  nivel int,
  pagina_ativa boolean,
  membros_ativos int,
  membros_afastados int,
  membros_novos_90d int,
  culto_ultima_chamada date,
  culto_presenca_8_semanas numeric,
  culto_em_alerta int,
  culto_visitantes_30d int,
  ebd_classes int,
  ebd_matriculados int,
  ebd_ultima_aula date,
  ebd_presenca_8_semanas numeric,
  visitas_sem_contato int,
  visitas_feitas_90d int,
  eventos_proximos int,
  dizimos_mes_centavos bigint,
  ofertas_mes_centavos bigint,
  mensalidade text
)
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (select public.hoje_local() as d),
  -- A mensalidade das unidades é só para o Responsável da igreja de cima.
  responsavel as (
    select exists (
      select 1 from public.company_members cm
      where cm.company_id = p_company_id and cm.user_id = auth.uid()
        and cm.role = 'owner' and cm.deleted_at is null
    ) as sim
  )
  select
    u.church_id, u.church_name, u.tipo, u.parent_id, u.nivel,
    coalesce(c.pagina_ativa, false),
    (select count(*) from public.rol_membros m
      where m.church_id = u.church_id and m.deleted_at is null and m.ativo)::int,
    (select count(*) from public.rol_membros m
      where m.church_id = u.church_id and m.deleted_at is null and m.situacao = 'afastado')::int,
    (select count(*) from public.rol_membros m
      where m.church_id = u.church_id and m.deleted_at is null and m.ativo
        and m.created_at::date >= hoje.d - 90)::int,
    (select max(ch.data) from public.chamadas ch
      where ch.church_id = u.church_id and ch.deleted_at is null),
    -- Justificado não conta nem a favor nem contra, como no resto do sistema.
    (select round(100.0 * count(*) filter (where e.estado = 'presente')
                  / nullif(count(*) filter (where e.estado in ('presente', 'ausente')), 0), 1)
       from public.acompanhamento_presencas_efetivas e
      where e.church_id = u.church_id and e.data >= hoje.d - 56),
    (select count(*) from public.acompanhamento_alertas(u.church_id))::int,
    (select count(*) from public.chamada_visitantes v
       join public.chamadas ch on ch.id = v.chamada_id and ch.deleted_at is null
      where v.church_id = u.church_id and ch.data >= hoje.d - 30)::int,
    (select count(*) from public.ebd_classes k
      where k.church_id = u.church_id and k.deleted_at is null and k.ativa)::int,
    (select count(*) from public.ebd_matriculas mt
       join public.ebd_classes k on k.id = mt.classe_id and k.deleted_at is null and k.ativa
      where mt.church_id = u.church_id and mt.ate is null)::int,
    (select max(a.data) from public.ebd_aulas a where a.church_id = u.church_id),
    (select round(100.0 * count(*) filter (where p.estado = 'presente')
                  / nullif(count(*) filter (where p.estado in ('presente', 'ausente')), 0), 1)
       from public.ebd_presencas p join public.ebd_aulas a on a.id = p.aula_id
      where a.church_id = u.church_id and a.data >= hoje.d - 56),
    (select count(*) from public.visitors v
      where v.church_id = u.church_id and v.deleted_at is null
        and v.visitado_em is null and v.contato_em is null)::int,
    (select count(*) from public.visitors v
      where v.church_id = u.church_id and v.deleted_at is null
        and v.visitado_em >= hoje.d - 90)::int,
    (select count(*) from public.church_events ev
      where ev.church_id = u.church_id and ev.deleted_at is null and ev.inicio >= now())::int,
    -- Tesouraria: só o total do mês corrente, por tipo.
    (select coalesce(sum(t.valor_centavos), 0) from public.tesouraria_lancamentos t
      where t.church_id = u.church_id and t.deleted_at is null and t.tipo = 'dizimo'
        and t.data >= date_trunc('month', hoje.d)::date)::bigint,
    (select coalesce(sum(t.valor_centavos), 0) from public.tesouraria_lancamentos t
      where t.church_id = u.church_id and t.deleted_at is null and t.tipo = 'oferta'
        and t.data >= date_trunc('month', hoje.d)::date)::bigint,
    case
      when not responsavel.sim then null
      when exists (select 1 from public.mensalidades_pendentes_base(u.company_id) b
                    where b.church_id = u.church_id and b.tolerancia_ate < hoje.d) then 'suspensa'
      when exists (select 1 from public.mensalidades_pendentes_base(u.company_id) b
                    where b.church_id = u.church_id) then 'pendente'
      when public.church_real_billable_sponsorships(u.church_id) > 0 then 'coberta'
      else 'em_dia'
    end
  from public.rede_unidades_abaixo(p_company_id) u
  join public.churches c on c.id = u.church_id
  cross join hoje
  cross join responsavel
  where public.is_company_admin(p_company_id)
  order by u.path;
$$;

revoke all on function public.rede_painel_unidades(uuid) from public, anon, authenticated;
grant execute on function public.rede_painel_unidades(uuid) to authenticated;

-- Presença por semana, das últimas 12, por unidade. `semana` é o DOMINGO que
-- fecha a semana (segunda a domingo): culto e EBD de domingo caem juntos.
-- Só vêm as semanas em que houve alguma coisa; quem lê preenche os vazios.
create or replace function public.rede_painel_semanas(p_company_id uuid)
returns table (
  church_id uuid,
  semana date,
  culto_presentes int,
  culto_ausentes int,
  culto_visitantes int,
  ebd_presentes int,
  ebd_ausentes int
)
language sql
stable
security definer
set search_path = public
as $$
  with u as (
    select x.church_id from public.rede_unidades_abaixo(p_company_id) x
    where public.is_company_admin(p_company_id)
  ),
  ini as (select date_trunc('week', public.hoje_local())::date - 77 as d),
  linhas as (
    select e.church_id, date_trunc('week', e.data)::date + 6 as semana,
           count(*) filter (where e.estado = 'presente')::int as cp,
           count(*) filter (where e.estado = 'ausente')::int as ca,
           0 as cv, 0 as ep, 0 as ea
    from public.acompanhamento_presencas_efetivas e
    join u on u.church_id = e.church_id, ini
    where e.data >= ini.d
    group by 1, 2
    union all
    select v.church_id, date_trunc('week', ch.data)::date + 6, 0, 0, count(*)::int, 0, 0
    from public.chamada_visitantes v
    join public.chamadas ch on ch.id = v.chamada_id and ch.deleted_at is null
    join u on u.church_id = v.church_id, ini
    where ch.data >= ini.d
    group by 1, 2
    union all
    select a.church_id, date_trunc('week', a.data)::date + 6, 0, 0, 0,
           count(*) filter (where p.estado = 'presente')::int,
           count(*) filter (where p.estado = 'ausente')::int
    from public.ebd_presencas p
    join public.ebd_aulas a on a.id = p.aula_id
    join u on u.church_id = a.church_id, ini
    where a.data >= ini.d
    group by 1, 2
  )
  select l.church_id, l.semana, sum(l.cp)::int, sum(l.ca)::int, sum(l.cv)::int, sum(l.ep)::int, sum(l.ea)::int
  from linhas l
  group by 1, 2
  order by 2, 1;
$$;

revoke all on function public.rede_painel_semanas(uuid) from public, anon, authenticated;
grant execute on function public.rede_painel_semanas(uuid) to authenticated;

-- Totais por mês, dos últimos 6, por unidade: dízimos, ofertas e membros que
-- entraram. Da tesouraria sai só a soma — nenhum lançamento, nenhum nome.
create or replace function public.rede_painel_meses(p_company_id uuid)
returns table (
  church_id uuid,
  mes date,
  dizimos_centavos bigint,
  ofertas_centavos bigint,
  membros_novos int
)
language sql
stable
security definer
set search_path = public
as $$
  with u as (
    select x.church_id from public.rede_unidades_abaixo(p_company_id) x
    where public.is_company_admin(p_company_id)
  ),
  ini as (select (date_trunc('month', public.hoje_local()) - interval '5 months')::date as d),
  linhas as (
    select t.church_id, date_trunc('month', t.data)::date as mes,
           coalesce(sum(t.valor_centavos) filter (where t.tipo = 'dizimo'), 0)::bigint as dz,
           coalesce(sum(t.valor_centavos) filter (where t.tipo = 'oferta'), 0)::bigint as ofe,
           0 as novos
    from public.tesouraria_lancamentos t
    join u on u.church_id = t.church_id, ini
    where t.deleted_at is null and t.data >= ini.d
    group by 1, 2
    union all
    select m.church_id, date_trunc('month', m.created_at)::date, 0, 0, count(*)::int
    from public.rol_membros m
    join u on u.church_id = m.church_id, ini
    where m.deleted_at is null and m.ativo and m.created_at::date >= ini.d
    group by 1, 2
  )
  select l.church_id, l.mes, sum(l.dz)::bigint, sum(l.ofe)::bigint, sum(l.novos)::int
  from linhas l
  group by 1, 2
  order by 2, 1;
$$;

revoke all on function public.rede_painel_meses(uuid) from public, anon, authenticated;
grant execute on function public.rede_painel_meses(uuid) to authenticated;

notify pgrst, 'reload schema';
