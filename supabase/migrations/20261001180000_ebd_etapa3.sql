-- ---------------------------------------------------------------------------
-- EBD — etapa 3: responsáveis, cuidados, promoção de classe e lições
-- ---------------------------------------------------------------------------
-- RESPONSÁVEIS: pai, mãe, avó... de um aluno (geralmente criança). Pode ser
-- alguém do rol (usa o telefone dele) ou só nome + telefone. "pode_buscar"
-- diz quem pode buscar a criança na saída.
-- CUIDADOS: alergias, medicação — texto curto no próprio membro.
--
-- Dado sensível (LGPD, criança): só quem cuida do aluno lê — quem cuida do
-- rol da igreja (can_acompanhar) ou da classe em que ele está matriculado
-- (can_ebd_classe: professor dela ou gestão da EBD). A igreja de cima nunca.
-- Escrita só por funções que conferem isso.
--
-- PROMOÇÃO: classes ganham idade mínima/máxima para sugerir a classe de cada
-- aluno; a gestão confere e aplica em lote (encerra a matrícula anterior,
-- abre a nova na data escolhida — o histórico fica).
--
-- LIÇÕES: cada trimestre tem a lista de lições (uma por domingo); a chamada
-- já vem com a lição daquele domingo.

-- ---------------------------------------------------------------------------
-- 1. Cuidados e responsáveis
-- ---------------------------------------------------------------------------
alter table public.rol_membros
  add column if not exists cuidados text check (cuidados is null or char_length(cuidados) <= 500);

comment on column public.rol_membros.cuidados is
  'Alergias, medicação, cuidados (dado sensível): quem cuida do rol ou da classe EBD do aluno.';

grant insert (cuidados) on public.rol_membros to authenticated;
grant update (cuidados) on public.rol_membros to authenticated;

create table if not exists public.rol_responsaveis (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  -- O aluno (a criança).
  membro_id uuid not null references public.rol_membros (id) on delete cascade,
  -- Responsável que está no rol (nome e telefone vêm de lá) — ou null.
  responsavel_id uuid references public.rol_membros (id) on delete set null,
  nome text check (nome is null or char_length(nome) between 2 and 120),
  telefone text check (telefone is null or char_length(telefone) between 8 and 20),
  parentesco text not null check (char_length(parentesco) between 2 and 30),
  pode_buscar boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rol_responsaveis_quem check (responsavel_id is not null or nome is not null),
  constraint rol_responsaveis_nao_si_mesmo check (responsavel_id is null or responsavel_id <> membro_id)
);
create index if not exists rol_responsaveis_membro_idx on public.rol_responsaveis (membro_id) where deleted_at is null;

drop trigger if exists set_rol_responsaveis_company_id on public.rol_responsaveis;
create trigger set_rol_responsaveis_company_id
  before insert or update of church_id on public.rol_responsaveis
  for each row execute function public.set_company_id_from_church();

-- Quem cuida deste aluno: o rol da igreja ou a classe em que ele está.
create or replace function public.pode_cuidar_do_aluno(p_membro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rol_membros m
    where m.id = p_membro_id and m.deleted_at is null
      and (
        public.can_acompanhar(m.church_id)
        or public.can_gerir_ebd(m.church_id)
        or exists (
          select 1 from public.ebd_matriculas mt
          where mt.membro_id = m.id and mt.ate is null and public.can_ebd_classe(mt.classe_id)
        )
      )
  );
$$;

revoke all on function public.pode_cuidar_do_aluno(uuid) from public, anon, authenticated;
grant execute on function public.pode_cuidar_do_aluno(uuid) to authenticated;

alter table public.rol_responsaveis enable row level security;
revoke all on public.rol_responsaveis from anon, authenticated;
grant select on public.rol_responsaveis to authenticated;
drop policy if exists rol_responsaveis_select on public.rol_responsaveis;
create policy rol_responsaveis_select on public.rol_responsaveis for select to authenticated
  using (public.pode_cuidar_do_aluno(membro_id));

-- Responsáveis de alunos, já com nome e telefone resolvidos (o professor não
-- lê o rol, então o nome do responsável que é membro vem por aqui).
create or replace function public.ebd_responsaveis(p_membro_ids uuid[])
returns table (
  id uuid,
  membro_id uuid,
  responsavel_id uuid,
  nome text,
  telefone text,
  parentesco text,
  pode_buscar boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select rr.id, rr.membro_id, rr.responsavel_id,
         coalesce(rm.nome, rr.nome), coalesce(rr.telefone, rm.whatsapp),
         rr.parentesco, rr.pode_buscar
  from public.rol_responsaveis rr
  left join public.rol_membros rm on rm.id = rr.responsavel_id and rm.deleted_at is null
  where rr.membro_id = any (p_membro_ids) and rr.deleted_at is null
    and public.pode_cuidar_do_aluno(rr.membro_id)
  order by rr.membro_id, rr.created_at;
$$;

create or replace function public.ebd_salvar_responsavel(
  p_id uuid,
  p_membro_id uuid,
  p_responsavel_id uuid,
  p_nome text,
  p_telefone text,
  p_parentesco text,
  p_pode_buscar boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church uuid;
  v_id uuid;
begin
  select church_id into v_church from public.rol_membros where id = p_membro_id and deleted_at is null;
  if v_church is null or not public.pode_cuidar_do_aluno(p_membro_id) then
    raise exception 'aluno nao encontrado' using errcode = 'P0002';
  end if;
  if p_responsavel_id is not null and not exists (
    select 1 from public.rol_membros where id = p_responsavel_id and church_id = v_church and deleted_at is null
  ) then
    raise exception 'responsavel de outra igreja' using errcode = 'check_violation';
  end if;

  if p_id is null then
    insert into public.rol_responsaveis (church_id, membro_id, responsavel_id, nome, telefone, parentesco, pode_buscar)
    values (v_church, p_membro_id, p_responsavel_id,
            case when p_responsavel_id is null then nullif(trim(coalesce(p_nome, '')), '') end,
            nullif(trim(coalesce(p_telefone, '')), ''), trim(p_parentesco), coalesce(p_pode_buscar, true))
    returning id into v_id;
  else
    update public.rol_responsaveis
    set responsavel_id = p_responsavel_id,
        nome = case when p_responsavel_id is null then nullif(trim(coalesce(p_nome, '')), '') end,
        telefone = nullif(trim(coalesce(p_telefone, '')), ''),
        parentesco = trim(p_parentesco),
        pode_buscar = coalesce(p_pode_buscar, true)
    where id = p_id and membro_id = p_membro_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'responsavel nao encontrado' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.ebd_remover_responsavel(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membro uuid;
begin
  select membro_id into v_membro from public.rol_responsaveis where id = p_id and deleted_at is null;
  if v_membro is null or not public.pode_cuidar_do_aluno(v_membro) then
    raise exception 'responsavel nao encontrado' using errcode = 'P0002';
  end if;
  update public.rol_responsaveis set deleted_at = now() where id = p_id;
end;
$$;

-- Cuidados pela EBD (o professor não tem UPDATE no rol).
create or replace function public.ebd_salvar_cuidados(p_membro_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pode_cuidar_do_aluno(p_membro_id) then
    raise exception 'aluno nao encontrado' using errcode = 'P0002';
  end if;
  update public.rol_membros set cuidados = nullif(trim(coalesce(p_texto, '')), '') where id = p_membro_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Idade da classe e promoção em lote
-- ---------------------------------------------------------------------------
alter table public.ebd_classes
  add column if not exists idade_minima smallint check (idade_minima is null or idade_minima between 0 and 120),
  add column if not exists idade_maxima smallint check (idade_maxima is null or idade_maxima between 0 and 120);

alter table public.ebd_classes drop constraint if exists ebd_classes_idades;
alter table public.ebd_classes
  add constraint ebd_classes_idades check (idade_minima is null or idade_maxima is null or idade_maxima >= idade_minima);

grant insert (idade_minima, idade_maxima) on public.ebd_classes to authenticated;
grant update (idade_minima, idade_maxima) on public.ebd_classes to authenticated;

-- p_itens: [{membro_id, classe_id}] — cada aluno vai para a classe indicada a
-- partir de p_data (a matrícula anterior termina na véspera). Só a gestão.
create or replace function public.ebd_promover(p_church_id uuid, p_data date, p_itens jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_membro uuid;
  v_classe uuid;
  v_atual public.ebd_matriculas%rowtype;
  v_n int := 0;
begin
  if not public.can_gerir_ebd(p_church_id) then
    raise exception 'sem permissao' using errcode = 'P0002';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_membro := (v_item ->> 'membro_id')::uuid;
    v_classe := (v_item ->> 'classe_id')::uuid;
    if not exists (select 1 from public.ebd_classes where id = v_classe and church_id = p_church_id and deleted_at is null and ativa)
       or not exists (select 1 from public.rol_membros where id = v_membro and church_id = p_church_id and deleted_at is null) then
      raise exception 'classe ou aluno de fora' using errcode = 'check_violation';
    end if;

    select * into v_atual from public.ebd_matriculas where membro_id = v_membro and ate is null;
    continue when v_atual.classe_id = v_classe; -- já está nela

    if v_atual.id is not null then
      update public.ebd_matriculas set ate = greatest(desde, p_data - 1) where id = v_atual.id;
    end if;
    insert into public.ebd_matriculas (classe_id, membro_id, church_id, desde)
    values (v_classe, v_membro, p_church_id, greatest(p_data, coalesce(v_atual.desde, p_data)));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Lições do trimestre
-- ---------------------------------------------------------------------------
create table if not exists public.ebd_licoes (
  id uuid primary key default gen_random_uuid(),
  trimestre_id uuid not null references public.ebd_trimestres (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  numero smallint not null check (numero between 1 and 30),
  data date not null,
  titulo text check (titulo is null or char_length(titulo) <= 160),
  created_at timestamptz not null default now()
);
create unique index if not exists ebd_licoes_numero_idx on public.ebd_licoes (trimestre_id, numero);
create index if not exists ebd_licoes_data_idx on public.ebd_licoes (church_id, data);

drop trigger if exists set_ebd_licoes_company_id on public.ebd_licoes;
create trigger set_ebd_licoes_company_id
  before insert or update of church_id on public.ebd_licoes
  for each row execute function public.set_company_id_from_church();

create or replace function public.ebd_confere_licao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.ebd_trimestres where id = new.trimestre_id and church_id = new.church_id) then
    raise exception 'trimestre de outra igreja' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.ebd_confere_licao() from public, anon, authenticated;
drop trigger if exists ebd_licoes_confere on public.ebd_licoes;
create trigger ebd_licoes_confere
  before insert or update on public.ebd_licoes
  for each row execute function public.ebd_confere_licao();

alter table public.ebd_licoes enable row level security;
revoke all on public.ebd_licoes from anon, authenticated;
grant select, delete on public.ebd_licoes to authenticated;
grant insert (trimestre_id, church_id, numero, data, titulo) on public.ebd_licoes to authenticated;
grant update (numero, data, titulo) on public.ebd_licoes to authenticated;

-- Mesma regra dos trimestres: a gestão escreve; quem tem classe na igreja lê.
drop policy if exists ebd_licoes_select on public.ebd_licoes;
create policy ebd_licoes_select on public.ebd_licoes for select to authenticated
  using (
    public.can_gerir_ebd(church_id)
    or exists (select 1 from public.ebd_classes k where k.church_id = ebd_licoes.church_id and public.can_ebd_classe(k.id))
  );
drop policy if exists ebd_licoes_insert on public.ebd_licoes;
create policy ebd_licoes_insert on public.ebd_licoes for insert to authenticated
  with check (public.can_gerir_ebd(church_id));
drop policy if exists ebd_licoes_update on public.ebd_licoes;
create policy ebd_licoes_update on public.ebd_licoes for update to authenticated
  using (public.can_gerir_ebd(church_id)) with check (public.can_gerir_ebd(church_id));
drop policy if exists ebd_licoes_delete on public.ebd_licoes;
create policy ebd_licoes_delete on public.ebd_licoes for delete to authenticated
  using (public.can_gerir_ebd(church_id));

-- ---------------------------------------------------------------------------
-- 4. Funções que ganham colunas novas (mesmo corpo da etapa anterior)
-- ---------------------------------------------------------------------------
drop function if exists public.ebd_alunos_da_classe(uuid, date);
create or replace function public.ebd_alunos_da_classe(p_classe_id uuid, p_data date default current_date)
returns table (
  membro_id uuid,
  matricula_id uuid,
  nome text,
  whatsapp text,
  nascimento date,
  membro_igreja boolean,
  desde date,
  cuidados text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, mt.id, m.nome, m.whatsapp, m.nascimento, m.membro_igreja, mt.desde, m.cuidados
  from public.ebd_matriculas mt
  join public.rol_membros m on m.id = mt.membro_id and m.deleted_at is null
  where mt.classe_id = p_classe_id
    and mt.desde <= p_data and (mt.ate is null or mt.ate >= p_data)
    and public.can_ebd_classe(p_classe_id)
  order by m.nome;
$$;

drop function if exists public.ebd_classes_da_igreja(uuid);
create or replace function public.ebd_classes_da_igreja(p_church_id uuid)
returns table (
  id uuid,
  nome text,
  faixa_etaria text,
  sala text,
  ordem smallint,
  ativa boolean,
  idade_minima smallint,
  idade_maxima smallint,
  matriculados int,
  professores jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.nome, k.faixa_etaria, k.sala, k.ordem, k.ativa, k.idade_minima, k.idade_maxima,
         (select count(*) from public.ebd_matriculas mt where mt.classe_id = k.id and mt.ate is null)::int,
         coalesce((
           select jsonb_agg(jsonb_build_object('membro_id', m.id, 'nome', m.nome, 'tem_login', m.user_id is not null)
                            order by m.nome)
           from public.ebd_professores p
           join public.rol_membros m on m.id = p.membro_id and m.deleted_at is null
           where p.classe_id = k.id
         ), '[]'::jsonb)
  from public.ebd_classes k
  where k.church_id = p_church_id and k.deleted_at is null
    and public.can_ebd_classe(k.id)
  order by k.ativa desc, k.ordem, k.nome;
$$;

drop function if exists public.ebd_alertas(uuid);
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
  situacao text,
  responsavel_nome text,
  responsavel_telefone text
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
              then 'em_acompanhamento' else 'pendente' end,
         resp.nome, resp.telefone
  from mats m
  join seq s on s.membro_id = m.membro_id and s.classe_id = m.classe_id
  join public.rol_membros r on r.id = m.membro_id and r.deleted_at is null and r.ativo
  left join ultima_presenca u on u.membro_id = m.membro_id and u.classe_id = m.classe_id
  left join contato c on c.membro_id = m.membro_id and c.classe_id = m.classe_id
  left join lateral (
    select coalesce(rm.nome, rr.nome) as nome, coalesce(rr.telefone, rm.whatsapp) as telefone
    from public.rol_responsaveis rr
    left join public.rol_membros rm on rm.id = rr.responsavel_id and rm.deleted_at is null
    where rr.membro_id = m.membro_id and rr.deleted_at is null
      and coalesce(rr.telefone, rm.whatsapp) is not null
    order by rr.created_at
    limit 1
  ) resp on true
  cross join cfg
  where s.faltas >= cfg.limite
    and (c.data is null or c.data < s.ultima_falta or c.resultado = 'em_acompanhamento')
  order by s.faltas desc, r.nome;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'ebd_alunos_da_classe(uuid, date)', 'ebd_classes_da_igreja(uuid)', 'ebd_alertas(uuid)',
    'ebd_responsaveis(uuid[])', 'ebd_salvar_responsavel(uuid, uuid, uuid, text, text, text, boolean)',
    'ebd_remover_responsavel(uuid)', 'ebd_salvar_cuidados(uuid, text)', 'ebd_promover(uuid, date, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
