-- ---------------------------------------------------------------------------
-- Quem quer visita: contato feito, quem visitou (membros) e contagem
-- ---------------------------------------------------------------------------
-- Três faltas do gerenciamento de pedidos de visita:
--  1. Não havia meio-termo entre "aguardando" e "visitado". Agora o pedido
--     passa por: aguardando contato → contato feito (com a data combinada)
--     → visitado.
--  2. "Quem visitou" era só texto livre, então não dava para saber quantas
--     visitas cada pessoa fez. Agora quem visitou é escolhido entre os
--     membros com cargo (e ainda cabe texto para quem é de fora).
--  3. (No app) o menu avisa quantos pedidos ainda estão sem contato.

alter table public.visitors
  add column if not exists contato_em date,
  add column if not exists agendada_para date,
  add column if not exists contato_obs text check (contato_obs is null or length(contato_obs) <= 500);

comment on column public.visitors.contato_em is
  'Dia em que a equipe falou com a pessoa. Com visitado_em nulo, o pedido está "em andamento".';

-- Os campos novos não entram no GRANT de insert do formulário público
-- (church_id, name, contact, endereco, mensagem): quem pede a visita não
-- consegue gravar "contato feito".

-- Quem visitou, um por linha, para contar. O nome que a tela mostra continua
-- em visitors.visitado_por (texto montado na hora do registro).
create table public.visita_participantes (
  visitor_id uuid not null references public.visitors (id) on delete cascade,
  membro_id uuid not null references public.rol_membros (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (visitor_id, membro_id)
);

create index visita_participantes_membro_idx on public.visita_participantes (membro_id);
create index visita_participantes_company_idx on public.visita_participantes (company_id);

create trigger set_visita_participantes_company_id
  before insert or update of church_id on public.visita_participantes
  for each row execute function public.set_company_id_from_church();

alter table public.visita_participantes enable row level security;
-- Nasce com ALL para anon/authenticated: tira tudo. Leitura e escrita só
-- pelas funções abaixo.
revoke all on public.visita_participantes from anon, authenticated;
create policy "visita_participantes_select_equipe"
  on public.visita_participantes for select
  to authenticated
  using (company_id is not null and public.tem_acesso(company_id, 'relationships'));

-- ---------------------------------------------------------------------------
-- Quem pode ser marcado como visitante: membros ativos COM cargo da igreja
-- ---------------------------------------------------------------------------
-- Só nome e cargos. Quem cuida das visitas pode não ter acesso ao cadastro
-- de membros, então a lista vem por aqui, não pela tabela.
create or replace function public.visita_quem_pode_visitar(p_company_id uuid)
returns table (membro_id uuid, nome text, cargos text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.nome, string_agg(c.nome, ', ' order by c.ordem, c.nome)
  from public.churches ch
  join public.rol_membros m on m.church_id = ch.id and m.deleted_at is null and m.ativo
  join public.rol_membro_cargos rc on rc.membro_id = m.id
  join public.cargos c on c.id = rc.cargo_id and c.deleted_at is null
  where ch.company_id = p_company_id
    and ch.deleted_at is null
    and public.tem_acesso(p_company_id, 'relationships')
  group by m.id, m.nome
  order by m.nome;
$$;

revoke all on function public.visita_quem_pode_visitar(uuid) from public, anon, authenticated;
grant execute on function public.visita_quem_pode_visitar(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Contato feito (e, se combinado, o dia da visita). p_desfazer volta o
-- pedido para "aguardando contato".
-- ---------------------------------------------------------------------------
create or replace function public.registrar_contato_visita(
  p_visitor_id uuid,
  p_agendada_para date,
  p_obs text,
  p_desfazer boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company
  from public.visitors
  where id = p_visitor_id and deleted_at is null;

  if v_company is null or not public.tem_acesso(v_company, 'relationships') then
    raise exception 'pedido não encontrado' using errcode = 'P0002';
  end if;

  update public.visitors
     set contato_em = case when p_desfazer then null else (now() at time zone 'America/Sao_Paulo')::date end,
         agendada_para = case when p_desfazer then null else p_agendada_para end,
         contato_obs = case when p_desfazer then null else nullif(btrim(coalesce(p_obs, '')), '') end,
         atualizado_por = auth.uid(),
         updated_at = now()
   where id = p_visitor_id;
end;
$$;

revoke all on function public.registrar_contato_visita(uuid, date, text, boolean) from public, anon, authenticated;
grant execute on function public.registrar_contato_visita(uuid, date, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Visita feita: data, quem foi (membros e/ou outras pessoas) e como foi.
-- p_visitado_em nulo desfaz a visita (volta para "contato feito" ou
-- "aguardando", conforme o que já havia).
-- ---------------------------------------------------------------------------
drop function if exists public.registrar_visita(uuid, date, text, text);

create or replace function public.registrar_visita(
  p_visitor_id uuid,
  p_visitado_em date,
  p_membros uuid[],
  p_outros text,
  p_obs text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visita public.visitors%rowtype;
  v_membros uuid[] := coalesce(p_membros, '{}');
  v_outros text := nullif(btrim(coalesce(p_outros, '')), '');
  v_nomes text;
begin
  select * into v_visita
  from public.visitors
  where id = p_visitor_id and deleted_at is null;

  -- Só a equipe da PRÓPRIA igreja com acesso ao módulo.
  if v_visita.id is null or v_visita.company_id is null
     or not public.tem_acesso(v_visita.company_id, 'relationships') then
    raise exception 'pedido não encontrado' using errcode = 'P0002';
  end if;

  delete from public.visita_participantes where visitor_id = p_visitor_id;

  if p_visitado_em is null then
    update public.visitors
       set visitado_em = null, visitado_por = null, visita_obs = null,
           atualizado_por = auth.uid(), updated_at = now()
     where id = p_visitor_id;
    return;
  end if;

  if cardinality(v_membros) = 0 and v_outros is null then
    raise exception 'informe quem fez a visita' using errcode = '22023';
  end if;
  if cardinality(v_membros) > 20 then
    raise exception 'gente demais na visita' using errcode = '22023';
  end if;

  -- Só membros (não excluídos) da igreja do pedido.
  if exists (
    select 1 from unnest(v_membros) as pedido(id)
    where not exists (
      select 1 from public.rol_membros m
      where m.id = pedido.id and m.church_id = v_visita.church_id and m.deleted_at is null
    )
  ) then
    raise exception 'membro de outra igreja' using errcode = '23514';
  end if;

  insert into public.visita_participantes (visitor_id, membro_id, church_id)
  select distinct p_visitor_id, pedido.id, v_visita.church_id from unnest(v_membros) as pedido(id);

  select string_agg(m.nome, ', ' order by m.nome) into v_nomes
  from public.rol_membros m where m.id = any (v_membros);

  update public.visitors
     set visitado_em = p_visitado_em,
         visitado_por = left(concat_ws(', ', v_nomes, v_outros), 300),
         visita_obs = nullif(btrim(coalesce(p_obs, '')), ''),
         -- Visitou sem registrar o contato antes: o contato fica na mesma data.
         contato_em = coalesce(contato_em, p_visitado_em),
         atualizado_por = auth.uid(),
         updated_at = now()
   where id = p_visitor_id;
end;
$$;

-- visitado_por guardava até 120; a lista de nomes pode passar disso.
alter table public.visitors drop constraint if exists visitors_visitado_por_check;
alter table public.visitors add constraint visitors_visitado_por_check
  check (visitado_por is null or length(visitado_por) <= 300);

revoke all on function public.registrar_visita(uuid, date, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.registrar_visita(uuid, date, uuid[], text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Quantas visitas cada membro fez no período (pela data da visita).
-- ---------------------------------------------------------------------------
create or replace function public.visitas_por_pessoa(p_company_id uuid, p_de date, p_ate date)
returns table (membro_id uuid, nome text, visitas int)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.nome, count(*)::int
  from public.visita_participantes vp
  join public.visitors v on v.id = vp.visitor_id and v.deleted_at is null and v.visitado_em is not null
  join public.rol_membros m on m.id = vp.membro_id
  where vp.company_id = p_company_id
    and (p_de is null or v.visitado_em >= p_de)
    and (p_ate is null or v.visitado_em <= p_ate)
    and public.tem_acesso(p_company_id, 'relationships')
  group by m.id, m.nome
  order by count(*) desc, m.nome;
$$;

revoke all on function public.visitas_por_pessoa(uuid, date, date) from public, anon, authenticated;
grant execute on function public.visitas_por_pessoa(uuid, date, date) to authenticated;

create index if not exists visitors_sem_contato_idx
  on public.visitors (company_id)
  where contato_em is null and visitado_em is null and deleted_at is null;

notify pgrst, 'reload schema';
