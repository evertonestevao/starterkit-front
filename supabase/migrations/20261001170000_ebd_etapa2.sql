-- ---------------------------------------------------------------------------
-- EBD — etapa 2: alertas de faltas, contatos, relatórios e trimestres
-- ---------------------------------------------------------------------------
-- ALERTA (separado do alerta dos cultos): mesma regra da chamada da igreja,
-- contada só na classe em que a pessoa está matriculada hoje, a partir da
-- data da matrícula:
--   ausente soma, justificado é neutro, presente zera.
-- O contato registrado (ebd_contatos) tira da lista; "em acompanhamento"
-- mantém com essa marca; uma falta nova depois do contato traz de volta.
--
-- Quem vê: a gestão da EBD vê todas as classes; o professor, só as dele
-- (can_ebd_classe). A igreja de cima não vê nada.

-- ---------------------------------------------------------------------------
-- 1. Regras por igreja
-- ---------------------------------------------------------------------------
create table if not exists public.ebd_config (
  church_id uuid primary key references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  faltas_alerta smallint not null default 3 check (faltas_alerta between 1 and 20),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Contatos feitos a partir do alerta da EBD
-- ---------------------------------------------------------------------------
create table if not exists public.ebd_contatos (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  membro_id uuid not null references public.rol_membros (id) on delete cascade,
  classe_id uuid not null references public.ebd_classes (id) on delete cascade,
  data date not null default current_date,
  resultado text not null
    check (resultado in ('retornou', 'em_acompanhamento', 'mudou_de_cidade', 'outro')),
  observacao text check (observacao is null or char_length(observacao) <= 1000),
  feito_por uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ebd_contatos_membro_idx on public.ebd_contatos (membro_id, classe_id, data desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 3. Trimestres (períodos da revista)
-- ---------------------------------------------------------------------------
create table if not exists public.ebd_trimestres (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 60),
  inicio date not null,
  fim date not null,
  revista text check (revista is null or char_length(revista) <= 120),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ebd_trimestres_periodo check (fim >= inicio and fim - inicio <= 200)
);
create index if not exists ebd_trimestres_church_idx on public.ebd_trimestres (church_id, inicio desc)
  where deleted_at is null;

do $$
declare t text;
begin
  foreach t in array array['ebd_config', 'ebd_contatos', 'ebd_trimestres'] loop
    execute format('drop trigger if exists set_%1$s_company_id on public.%1$s', t);
    execute format(
      'create trigger set_%1$s_company_id before insert or update of church_id on public.%1$s
         for each row execute function public.set_company_id_from_church()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

drop trigger if exists set_ebd_trimestres_updated_at on public.ebd_trimestres;
create trigger set_ebd_trimestres_updated_at
  before update on public.ebd_trimestres
  for each row execute function public.set_updated_at();

-- Contato: a classe e o membro são da mesma igreja do registro.
create or replace function public.ebd_confere_contato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.ebd_classes where id = new.classe_id and church_id = new.church_id)
     or not exists (select 1 from public.rol_membros where id = new.membro_id and church_id = new.church_id) then
    raise exception 'classe ou membro de outra igreja' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.ebd_confere_contato() from public, anon, authenticated;
drop trigger if exists ebd_contatos_confere on public.ebd_contatos;
create trigger ebd_contatos_confere
  before insert or update on public.ebd_contatos
  for each row execute function public.ebd_confere_contato();

-- Config: só a gestão.
grant insert (church_id, faltas_alerta) on public.ebd_config to authenticated;
grant update (faltas_alerta, updated_at) on public.ebd_config to authenticated;
drop policy if exists ebd_config_select on public.ebd_config;
create policy ebd_config_select on public.ebd_config for select to authenticated
  using (public.can_gerir_ebd(church_id));
drop policy if exists ebd_config_insert on public.ebd_config;
create policy ebd_config_insert on public.ebd_config for insert to authenticated
  with check (public.can_gerir_ebd(church_id));
drop policy if exists ebd_config_update on public.ebd_config;
create policy ebd_config_update on public.ebd_config for update to authenticated
  using (public.can_gerir_ebd(church_id)) with check (public.can_gerir_ebd(church_id));

-- Contatos: quem cuida da classe (gestão ou professor dela).
grant insert (church_id, membro_id, classe_id, data, resultado, observacao) on public.ebd_contatos to authenticated;
drop policy if exists ebd_contatos_select on public.ebd_contatos;
create policy ebd_contatos_select on public.ebd_contatos for select to authenticated
  using (public.can_ebd_classe(classe_id));
drop policy if exists ebd_contatos_insert on public.ebd_contatos;
create policy ebd_contatos_insert on public.ebd_contatos for insert to authenticated
  with check (public.can_ebd_classe(classe_id));

-- Trimestres: a gestão escreve; quem tem alguma classe na igreja lê (para
-- escolher o período dos relatórios).
grant insert (church_id, nome, inicio, fim, revista) on public.ebd_trimestres to authenticated;
grant update (nome, inicio, fim, revista, deleted_at) on public.ebd_trimestres to authenticated;
drop policy if exists ebd_trimestres_select on public.ebd_trimestres;
create policy ebd_trimestres_select on public.ebd_trimestres for select to authenticated
  using (
    public.can_gerir_ebd(church_id)
    or exists (select 1 from public.ebd_classes k where k.church_id = ebd_trimestres.church_id and public.can_ebd_classe(k.id))
  );
drop policy if exists ebd_trimestres_insert on public.ebd_trimestres;
create policy ebd_trimestres_insert on public.ebd_trimestres for insert to authenticated
  with check (public.can_gerir_ebd(church_id));
drop policy if exists ebd_trimestres_update on public.ebd_trimestres;
create policy ebd_trimestres_update on public.ebd_trimestres for update to authenticated
  using (public.can_gerir_ebd(church_id)) with check (public.can_gerir_ebd(church_id));

-- ---------------------------------------------------------------------------
-- 4. Alertas de faltas da EBD
-- ---------------------------------------------------------------------------
create or replace function public.ebd_alertas(p_church_id uuid)
returns table (
  membro_id uuid,
  nome text,
  whatsapp text,
  nascimento date,
  membro_igreja boolean,
  classe_id uuid,
  classe_nome text,
  faltas_seguidas int,
  ultima_presenca date,
  ultima_falta date,
  contato_data date,
  contato_resultado text,
  situacao text
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce((select faltas_alerta from public.ebd_config where church_id = p_church_id), 3) as limite
  ),
  mats as (
    select mt.membro_id, mt.classe_id, mt.desde, k.nome as classe_nome
    from public.ebd_matriculas mt
    join public.ebd_classes k on k.id = mt.classe_id and k.deleted_at is null and k.ativa
    where mt.church_id = p_church_id and mt.ate is null
      and public.can_ebd_classe(mt.classe_id)
  ),
  pres as (
    select m.membro_id, m.classe_id, a.data, p.estado
    from mats m
    join public.ebd_aulas a on a.classe_id = m.classe_id and a.data >= m.desde
    join public.ebd_presencas p on p.aula_id = a.id and p.membro_id = m.membro_id
  ),
  ultima_presenca as (
    select membro_id, classe_id, max(data) as data from pres where estado = 'presente' group by 1, 2
  ),
  seq as (
    select p.membro_id, p.classe_id,
           count(*) filter (where p.estado = 'ausente')::int as faltas,
           max(p.data) filter (where p.estado = 'ausente') as ultima_falta
    from pres p
    left join ultima_presenca u on u.membro_id = p.membro_id and u.classe_id = p.classe_id
    where p.data > coalesce(u.data, '-infinity'::date)
    group by 1, 2
  ),
  contato as (
    select distinct on (c.membro_id, c.classe_id) c.membro_id, c.classe_id, c.data, c.resultado
    from public.ebd_contatos c
    where c.church_id = p_church_id and c.deleted_at is null
    order by c.membro_id, c.classe_id, c.data desc, c.created_at desc
  )
  select r.id, r.nome, r.whatsapp, r.nascimento, r.membro_igreja, m.classe_id, m.classe_nome,
         s.faltas, u.data, s.ultima_falta, c.data, c.resultado,
         case when c.data >= s.ultima_falta and c.resultado = 'em_acompanhamento'
              then 'em_acompanhamento' else 'pendente' end
  from mats m
  join seq s on s.membro_id = m.membro_id and s.classe_id = m.classe_id
  join public.rol_membros r on r.id = m.membro_id and r.deleted_at is null and r.ativo
  left join ultima_presenca u on u.membro_id = m.membro_id and u.classe_id = m.classe_id
  left join contato c on c.membro_id = m.membro_id and c.classe_id = m.classe_id
  cross join cfg
  where s.faltas >= cfg.limite
    and (c.data is null or c.data < s.ultima_falta or c.resultado = 'em_acompanhamento')
  order by s.faltas desc, r.nome;
$$;

-- ---------------------------------------------------------------------------
-- 5. Relatórios
-- ---------------------------------------------------------------------------
-- Por classe, num período.
create or replace function public.ebd_relatorio_classes(p_church_id uuid, p_de date, p_ate date)
returns table (
  classe_id uuid,
  classe_nome text,
  aulas int,
  presentes int,
  ausentes int,
  justificados int,
  visitantes int,
  biblias int,
  revistas int,
  oferta_centavos bigint,
  matriculados_hoje int
)
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.nome,
         (select count(*) from public.ebd_aulas a where a.classe_id = k.id and a.data between p_de and p_ate)::int,
         (select count(*) from public.ebd_presencas p join public.ebd_aulas a on a.id = p.aula_id
           where a.classe_id = k.id and a.data between p_de and p_ate and p.estado = 'presente')::int,
         (select count(*) from public.ebd_presencas p join public.ebd_aulas a on a.id = p.aula_id
           where a.classe_id = k.id and a.data between p_de and p_ate and p.estado = 'ausente')::int,
         (select count(*) from public.ebd_presencas p join public.ebd_aulas a on a.id = p.aula_id
           where a.classe_id = k.id and a.data between p_de and p_ate and p.estado = 'justificado')::int,
         (select count(*) from public.ebd_visitantes v join public.ebd_aulas a on a.id = v.aula_id
           where a.classe_id = k.id and a.data between p_de and p_ate)::int,
         coalesce((select sum(a.biblias) from public.ebd_aulas a where a.classe_id = k.id and a.data between p_de and p_ate), 0)::int,
         coalesce((select sum(a.revistas) from public.ebd_aulas a where a.classe_id = k.id and a.data between p_de and p_ate), 0)::int,
         coalesce((select sum(a.oferta_centavos) from public.ebd_aulas a where a.classe_id = k.id and a.data between p_de and p_ate), 0)::bigint,
         (select count(*) from public.ebd_matriculas mt where mt.classe_id = k.id and mt.ate is null)::int
  from public.ebd_classes k
  where k.church_id = p_church_id and k.deleted_at is null
    and public.can_ebd_classe(k.id)
  order by k.ativa desc, k.ordem, k.nome;
$$;

-- Frequência por aluno (e classe), num período. Inclui quem está
-- matriculado hoje mesmo sem aula no período. % só sobre P e A.
create or replace function public.ebd_frequencia_alunos(p_church_id uuid, p_classe_id uuid, p_de date, p_ate date)
returns table (
  membro_id uuid,
  nome text,
  membro_igreja boolean,
  classe_id uuid,
  classe_nome text,
  matriculado_hoje boolean,
  presentes int,
  ausentes int,
  justificados int,
  percentual numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with alvo as (
    select k.id, k.nome from public.ebd_classes k
    where k.church_id = p_church_id and k.deleted_at is null
      and (p_classe_id is null or k.id = p_classe_id)
      and public.can_ebd_classe(k.id)
  ),
  pessoas as (
    select distinct mt.membro_id, mt.classe_id
    from public.ebd_matriculas mt join alvo on alvo.id = mt.classe_id
    where mt.ate is null or mt.ate >= p_de
  ),
  contagem as (
    select p.membro_id, a.classe_id,
           count(*) filter (where p.estado = 'presente') as pr,
           count(*) filter (where p.estado = 'ausente') as au,
           count(*) filter (where p.estado = 'justificado') as ju
    from public.ebd_presencas p
    join public.ebd_aulas a on a.id = p.aula_id
    join alvo on alvo.id = a.classe_id
    where a.data between p_de and p_ate
    group by 1, 2
  )
  select r.id, r.nome, r.membro_igreja, alvo.id, alvo.nome,
         exists (select 1 from public.ebd_matriculas mt where mt.membro_id = r.id and mt.classe_id = alvo.id and mt.ate is null),
         coalesce(c.pr, 0)::int, coalesce(c.au, 0)::int, coalesce(c.ju, 0)::int,
         round(100.0 * coalesce(c.pr, 0) / nullif(coalesce(c.pr, 0) + coalesce(c.au, 0), 0), 1)
  from pessoas pe
  join alvo on alvo.id = pe.classe_id
  join public.rol_membros r on r.id = pe.membro_id and r.deleted_at is null
  left join contagem c on c.membro_id = pe.membro_id and c.classe_id = pe.classe_id
  order by alvo.nome, r.nome;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'ebd_alertas(uuid)', 'ebd_relatorio_classes(uuid, date, date)', 'ebd_frequencia_alunos(uuid, uuid, date, date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
