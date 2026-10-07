-- ---------------------------------------------------------------------------
-- EBD — Escola Bíblica Dominical (etapa 1)
-- ---------------------------------------------------------------------------
-- Classes, matrícula (o vínculo pessoa ↔ classe), chamada por classe e por
-- domingo (separada da chamada dos cultos), visitantes e a contagem do dia
-- (Bíblias, revistas, oferta — só registro).
--
-- PESSOAS: o aluno é sempre alguém de rol_membros. Quem não faz parte do
-- quadro de membros (ex.: filho de um membro) entra com membro_igreja =
-- false. Não há um terceiro cadastro de gente.
--
-- QUEM USA:
--   * gestão da EBD: owner/admin e quem tem `pode_gerir_ebd` (secretaria);
--     vê e mexe em todas as classes da própria igreja;
--   * professor: membro ligado a uma conta e cadastrado como professor da
--     classe; vê SÓ as classes dele.
-- O professor não ganha leitura do rol: os alunos chegam pela função
-- ebd_alunos_da_classe, com nome, telefone e nascimento — sem observações
-- pastorais, cargos ou justificativas. A igreja de cima não vê nada aqui.
--
-- Escrita de aula/presença/matrícula só por funções (security definer) que
-- conferem a classe: o client não grava essas tabelas direto.

-- ---------------------------------------------------------------------------
-- 0. Pessoa que não é do quadro de membros; secretaria da EBD
-- ---------------------------------------------------------------------------
alter table public.rol_membros
  add column if not exists membro_igreja boolean not null default true;

comment on column public.rol_membros.membro_igreja is
  'Faz parte do quadro de membros. false = congregado, criança, aluno da EBD que a igreja ainda não recebeu como membro.';

grant insert (membro_igreja) on public.rol_membros to authenticated;
grant update (membro_igreja) on public.rol_membros to authenticated;

alter table public.company_members
  add column if not exists pode_gerir_ebd boolean not null default false;

comment on column public.company_members.pode_gerir_ebd is
  'Member da secretaria da EBD: vê e cuida de todas as classes. Owner/admin já podem.';

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.ebd_classes (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 60),
  faixa_etaria text check (faixa_etaria is null or char_length(faixa_etaria) <= 40),
  sala text check (sala is null or char_length(sala) <= 40),
  ordem smallint not null default 100 check (ordem between 0 and 999),
  ativa boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ebd_classes_nome_idx
  on public.ebd_classes (church_id, lower(nome)) where deleted_at is null;

-- Professor = membro do rol. Sem conta ligada, aparece como professor mas
-- não acessa o sistema.
create table if not exists public.ebd_professores (
  classe_id uuid not null references public.ebd_classes (id) on delete cascade,
  membro_id uuid not null references public.rol_membros (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (classe_id, membro_id)
);
create index if not exists ebd_professores_membro_idx on public.ebd_professores (membro_id);

-- Matrícula: uma classe por vez por pessoa (mudar de classe encerra a outra).
create table if not exists public.ebd_matriculas (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.ebd_classes (id) on delete cascade,
  membro_id uuid not null references public.rol_membros (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  desde date not null default current_date,
  ate date,
  created_at timestamptz not null default now(),
  constraint ebd_matriculas_periodo check (ate is null or ate >= desde)
);
create unique index if not exists ebd_matriculas_uma_ativa_idx
  on public.ebd_matriculas (membro_id) where ate is null;
create index if not exists ebd_matriculas_classe_idx on public.ebd_matriculas (classe_id, desde);

-- Aula = a chamada de uma classe num domingo, com a contagem do dia.
create table if not exists public.ebd_aulas (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.ebd_classes (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  data date not null,
  licao text check (licao is null or char_length(licao) <= 200),
  biblias smallint not null default 0 check (biblias between 0 and 999),
  revistas smallint not null default 0 check (revistas between 0 and 999),
  oferta_centavos integer not null default 0 check (oferta_centavos between 0 and 100000000),
  feita_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ebd_aulas_classe_data_idx on public.ebd_aulas (classe_id, data);
create index if not exists ebd_aulas_church_data_idx on public.ebd_aulas (church_id, data desc);

create table if not exists public.ebd_presencas (
  aula_id uuid not null references public.ebd_aulas (id) on delete cascade,
  membro_id uuid not null references public.rol_membros (id) on delete cascade,
  classe_id uuid not null references public.ebd_classes (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  estado text not null check (estado in ('presente', 'ausente', 'justificado')),
  primary key (aula_id, membro_id)
);
create index if not exists ebd_presencas_membro_idx on public.ebd_presencas (membro_id);

create table if not exists public.ebd_visitantes (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references public.ebd_aulas (id) on delete cascade,
  classe_id uuid not null references public.ebd_classes (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 120),
  telefone text check (telefone is null or char_length(telefone) between 8 and 20),
  -- Preenchido quando o visitante é matriculado (virou aluno).
  membro_id uuid references public.rol_membros (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ebd_visitantes_classe_idx on public.ebd_visitantes (classe_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['ebd_classes', 'ebd_professores', 'ebd_matriculas', 'ebd_aulas', 'ebd_presencas', 'ebd_visitantes'] loop
    execute format('drop trigger if exists set_%1$s_company_id on public.%1$s', t);
    execute format(
      'create trigger set_%1$s_company_id before insert or update of church_id on public.%1$s
         for each row execute function public.set_company_id_from_church()', t);
  end loop;
  foreach t in array array['ebd_classes', 'ebd_aulas'] loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger set_%1$s_updated_at before update on public.%1$s
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Professor: a classe e o membro são da mesma igreja.
create or replace function public.ebd_confere_professor()
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
revoke all on function public.ebd_confere_professor() from public, anon, authenticated;
drop trigger if exists ebd_professores_confere on public.ebd_professores;
create trigger ebd_professores_confere
  before insert or update on public.ebd_professores
  for each row execute function public.ebd_confere_professor();

-- ---------------------------------------------------------------------------
-- 2. Quem pode
-- ---------------------------------------------------------------------------
create or replace function public.can_gerir_ebd(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.churches c
    join public.company_members cm on cm.company_id = c.company_id
    where c.id = p_church_id
      and c.deleted_at is null
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
      and (cm.role in ('owner', 'admin') or cm.pode_gerir_ebd)
  );
$$;

-- A classe é visível para a gestão da EBD da igreja ou para um professor
-- dela (membro ligado à conta de quem pergunta, que ainda tem login ativo).
create or replace function public.can_ebd_classe(p_classe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ebd_classes k
    where k.id = p_classe_id and k.deleted_at is null
      and (
        public.can_gerir_ebd(k.church_id)
        or exists (
          select 1
          from public.ebd_professores p
          join public.rol_membros m on m.id = p.membro_id and m.deleted_at is null
          join public.churches c on c.id = k.church_id
          join public.company_members cm on cm.company_id = c.company_id
            and cm.user_id = m.user_id and cm.deleted_at is null
          where p.classe_id = k.id and m.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.can_gerir_ebd(uuid) from public, anon, authenticated;
revoke all on function public.can_ebd_classe(uuid) from public, anon, authenticated;
grant execute on function public.can_gerir_ebd(uuid) to authenticated;
grant execute on function public.can_ebd_classe(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ebd_classes', 'ebd_professores', 'ebd_matriculas', 'ebd_aulas', 'ebd_presencas', 'ebd_visitantes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists ebd_classes_select on public.ebd_classes;
create policy ebd_classes_select on public.ebd_classes for select to authenticated
  using (public.can_gerir_ebd(church_id) or public.can_ebd_classe(id));

-- Classes e professores: só a gestão cria e edita.
grant insert (church_id, nome, faixa_etaria, sala, ordem) on public.ebd_classes to authenticated;
grant update (nome, faixa_etaria, sala, ordem, ativa, deleted_at) on public.ebd_classes to authenticated;
drop policy if exists ebd_classes_insert on public.ebd_classes;
create policy ebd_classes_insert on public.ebd_classes for insert to authenticated
  with check (public.can_gerir_ebd(church_id));
drop policy if exists ebd_classes_update on public.ebd_classes;
create policy ebd_classes_update on public.ebd_classes for update to authenticated
  using (public.can_gerir_ebd(church_id)) with check (public.can_gerir_ebd(church_id));

grant insert (classe_id, membro_id, church_id) on public.ebd_professores to authenticated;
grant delete on public.ebd_professores to authenticated;
drop policy if exists ebd_professores_select on public.ebd_professores;
create policy ebd_professores_select on public.ebd_professores for select to authenticated
  using (public.can_ebd_classe(classe_id));
drop policy if exists ebd_professores_insert on public.ebd_professores;
create policy ebd_professores_insert on public.ebd_professores for insert to authenticated
  with check (public.can_gerir_ebd(church_id));
drop policy if exists ebd_professores_delete on public.ebd_professores;
create policy ebd_professores_delete on public.ebd_professores for delete to authenticated
  using (public.can_gerir_ebd(church_id));

-- Matrículas, aulas, presenças, visitantes: leitura por classe; escrita só
-- pelas funções abaixo (sem GRANT de escrita para o client).
drop policy if exists ebd_matriculas_select on public.ebd_matriculas;
create policy ebd_matriculas_select on public.ebd_matriculas for select to authenticated
  using (public.can_ebd_classe(classe_id));
drop policy if exists ebd_aulas_select on public.ebd_aulas;
create policy ebd_aulas_select on public.ebd_aulas for select to authenticated
  using (public.can_ebd_classe(classe_id));
drop policy if exists ebd_presencas_select on public.ebd_presencas;
create policy ebd_presencas_select on public.ebd_presencas for select to authenticated
  using (public.can_ebd_classe(classe_id));
drop policy if exists ebd_visitantes_select on public.ebd_visitantes;
create policy ebd_visitantes_select on public.ebd_visitantes for select to authenticated
  using (public.can_ebd_classe(classe_id));

-- ---------------------------------------------------------------------------
-- 4. Funções de leitura
-- ---------------------------------------------------------------------------
-- Alunos matriculados na classe numa data: só o que a chamada precisa.
create or replace function public.ebd_alunos_da_classe(p_classe_id uuid, p_data date default current_date)
returns table (
  membro_id uuid,
  matricula_id uuid,
  nome text,
  whatsapp text,
  nascimento date,
  membro_igreja boolean,
  desde date
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, mt.id, m.nome, m.whatsapp, m.nascimento, m.membro_igreja, mt.desde
  from public.ebd_matriculas mt
  join public.rol_membros m on m.id = mt.membro_id and m.deleted_at is null
  where mt.classe_id = p_classe_id
    and mt.desde <= p_data and (mt.ate is null or mt.ate >= p_data)
    and public.can_ebd_classe(p_classe_id)
  order by m.nome;
$$;

-- Busca de pessoas para matricular (gestão): nome, se é membro e a classe atual.
create or replace function public.ebd_buscar_pessoas(p_church_id uuid, p_termo text)
returns table (membro_id uuid, nome text, membro_igreja boolean, classe_atual text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.nome, m.membro_igreja, k.nome
  from public.rol_membros m
  left join public.ebd_matriculas mt on mt.membro_id = m.id and mt.ate is null
  left join public.ebd_classes k on k.id = mt.classe_id
  where m.church_id = p_church_id
    and m.deleted_at is null and m.ativo
    and public.can_gerir_ebd(p_church_id)
    and (coalesce(trim(p_termo), '') = '' or m.nome_busca like '%' || lower(trim(p_termo)) || '%')
  order by m.nome
  limit 30;
$$;

-- Aulas de uma classe, com as contagens.
create or replace function public.ebd_aulas_da_classe(p_classe_id uuid, p_limite int default 30)
returns table (
  aula_id uuid,
  data date,
  licao text,
  presentes int,
  ausentes int,
  justificados int,
  visitantes int,
  biblias int,
  revistas int,
  oferta_centavos int
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.data, a.licao,
         (select count(*) from public.ebd_presencas p where p.aula_id = a.id and p.estado = 'presente')::int,
         (select count(*) from public.ebd_presencas p where p.aula_id = a.id and p.estado = 'ausente')::int,
         (select count(*) from public.ebd_presencas p where p.aula_id = a.id and p.estado = 'justificado')::int,
         (select count(*) from public.ebd_visitantes v where v.aula_id = a.id)::int,
         a.biblias, a.revistas, a.oferta_centavos
  from public.ebd_aulas a
  where a.classe_id = p_classe_id and public.can_ebd_classe(p_classe_id)
  order by a.data desc
  limit least(greatest(p_limite, 1), 200);
$$;

-- Resumo do domingo: uma linha por classe que a pessoa enxerga.
create or replace function public.ebd_resumo_do_dia(p_church_id uuid, p_data date)
returns table (
  classe_id uuid,
  classe_nome text,
  matriculados int,
  chamada_feita boolean,
  presentes int,
  ausentes int,
  justificados int,
  visitantes int,
  biblias int,
  revistas int,
  oferta_centavos int,
  licao text
)
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.nome,
         (select count(*) from public.ebd_matriculas mt
           where mt.classe_id = k.id and mt.desde <= p_data and (mt.ate is null or mt.ate >= p_data))::int,
         a.id is not null,
         coalesce((select count(*) from public.ebd_presencas p where p.aula_id = a.id and p.estado = 'presente'), 0)::int,
         coalesce((select count(*) from public.ebd_presencas p where p.aula_id = a.id and p.estado = 'ausente'), 0)::int,
         coalesce((select count(*) from public.ebd_presencas p where p.aula_id = a.id and p.estado = 'justificado'), 0)::int,
         coalesce((select count(*) from public.ebd_visitantes v where v.aula_id = a.id), 0)::int,
         coalesce(a.biblias, 0)::int, coalesce(a.revistas, 0)::int, coalesce(a.oferta_centavos, 0)::int,
         a.licao
  from public.ebd_classes k
  left join public.ebd_aulas a on a.classe_id = k.id and a.data = p_data
  where k.church_id = p_church_id and k.deleted_at is null and k.ativa
    and public.can_ebd_classe(k.id)
  order by k.ordem, k.nome;
$$;

-- A EBD de uma pessoa, para a ficha do membro (quem cuida do rol ou da EBD).
create or replace function public.ebd_resumo_do_membro(p_membro_id uuid)
returns table (
  classe_atual text,
  desde date,
  presencas int,
  ausencias int,
  justificados int,
  ultima_presenca date,
  classes_anteriores text
)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select id, church_id from public.rol_membros
    where id = p_membro_id and deleted_at is null
      and (public.can_acompanhar(church_id) or public.can_gerir_ebd(church_id))
  )
  select
    (select k.nome from public.ebd_matriculas mt join public.ebd_classes k on k.id = mt.classe_id
      where mt.membro_id = m.id and mt.ate is null limit 1),
    (select mt.desde from public.ebd_matriculas mt where mt.membro_id = m.id and mt.ate is null limit 1),
    (select count(*) from public.ebd_presencas p where p.membro_id = m.id and p.estado = 'presente')::int,
    (select count(*) from public.ebd_presencas p where p.membro_id = m.id and p.estado = 'ausente')::int,
    (select count(*) from public.ebd_presencas p where p.membro_id = m.id and p.estado = 'justificado')::int,
    (select max(a.data) from public.ebd_presencas p join public.ebd_aulas a on a.id = p.aula_id
      where p.membro_id = m.id and p.estado = 'presente'),
    (select string_agg(distinct k.nome, ', ') from public.ebd_matriculas mt join public.ebd_classes k on k.id = mt.classe_id
      where mt.membro_id = m.id and mt.ate is not null)
  from m;
$$;

-- Classes que a pessoa enxerga, com professores e quantos matriculados hoje.
-- Os nomes dos professores vêm daqui porque a secretaria da EBD (e o
-- professor) não lê o rol.
create or replace function public.ebd_classes_da_igreja(p_church_id uuid)
returns table (
  id uuid,
  nome text,
  faixa_etaria text,
  sala text,
  ordem smallint,
  ativa boolean,
  matriculados int,
  professores jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.nome, k.faixa_etaria, k.sala, k.ordem, k.ativa,
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

revoke all on function public.ebd_classes_da_igreja(uuid) from public, anon, authenticated;
grant execute on function public.ebd_classes_da_igreja(uuid) to authenticated;

-- Empresas em que a pessoa é professora de alguma classe (para o menu).
create or replace function public.minhas_empresas_professor_ebd()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct c.company_id
  from public.ebd_professores p
  join public.rol_membros m on m.id = p.membro_id and m.deleted_at is null
  join public.ebd_classes k on k.id = p.classe_id and k.deleted_at is null and k.ativa
  join public.churches c on c.id = k.church_id
  join public.company_members cm on cm.company_id = c.company_id and cm.user_id = m.user_id and cm.deleted_at is null
  where m.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 5. Funções de escrita
-- ---------------------------------------------------------------------------
-- Matricular alguém que já está no rol (gestão). Mudar de classe encerra a
-- matrícula anterior ontem e começa a nova hoje.
create or replace function public.ebd_matricular(p_classe_id uuid, p_membro_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classe public.ebd_classes%rowtype;
  v_id uuid;
begin
  select * into v_classe from public.ebd_classes where id = p_classe_id and deleted_at is null and ativa;
  if v_classe.id is null or not public.can_gerir_ebd(v_classe.church_id) then
    raise exception 'classe nao encontrada' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.rol_membros where id = p_membro_id and church_id = v_classe.church_id and deleted_at is null
  ) then
    raise exception 'pessoa de outra igreja' using errcode = 'check_violation';
  end if;

  select id into v_id from public.ebd_matriculas where membro_id = p_membro_id and ate is null and classe_id = p_classe_id;
  if v_id is not null then
    return v_id; -- já está nesta classe
  end if;

  update public.ebd_matriculas
  set ate = greatest(desde, current_date - 1)
  where membro_id = p_membro_id and ate is null;

  insert into public.ebd_matriculas (classe_id, membro_id, church_id)
  values (p_classe_id, p_membro_id, v_classe.church_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Aluno novo que não é do quadro de membros (ex.: criança, visitante que
-- ficou). Professor da classe pode. Entra fora da chamada dos cultos.
create or replace function public.ebd_matricular_novo(
  p_classe_id uuid,
  p_nome text,
  p_telefone text,
  p_nascimento date,
  p_visitante_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classe public.ebd_classes%rowtype;
  v_membro uuid;
begin
  select * into v_classe from public.ebd_classes where id = p_classe_id and deleted_at is null and ativa;
  if v_classe.id is null or not public.can_ebd_classe(p_classe_id) then
    raise exception 'classe nao encontrada' using errcode = 'P0002';
  end if;

  insert into public.rol_membros (church_id, nome, whatsapp, nascimento, membro_igreja, participa_chamada)
  values (v_classe.church_id, trim(p_nome), nullif(trim(coalesce(p_telefone, '')), ''), p_nascimento, false, false)
  returning id into v_membro;

  insert into public.ebd_matriculas (classe_id, membro_id, church_id)
  values (p_classe_id, v_membro, v_classe.church_id);

  if p_visitante_id is not null then
    update public.ebd_visitantes set membro_id = v_membro
    where id = p_visitante_id and classe_id = p_classe_id;
  end if;
  return v_membro;
end;
$$;

-- Tirar o aluno da classe (gestão ou professor da classe). Fica o histórico.
create or replace function public.ebd_encerrar_matricula(p_matricula_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mt public.ebd_matriculas%rowtype;
begin
  select * into v_mt from public.ebd_matriculas where id = p_matricula_id and ate is null;
  if v_mt.id is null or not public.can_ebd_classe(v_mt.classe_id) then
    raise exception 'matricula nao encontrada' using errcode = 'P0002';
  end if;
  update public.ebd_matriculas set ate = greatest(desde, current_date) where id = p_matricula_id;
end;
$$;

-- Salvar a chamada da classe (cria ou reabre a aula do dia).
-- p_presencas: [{membro_id, estado}] — só alunos matriculados na data.
-- p_visitantes: [{nome, telefone?, membro_id?}] — substitui os da aula.
create or replace function public.ebd_salvar_aula(
  p_classe_id uuid,
  p_data date,
  p_licao text,
  p_biblias int,
  p_revistas int,
  p_oferta_centavos int,
  p_presencas jsonb,
  p_visitantes jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classe public.ebd_classes%rowtype;
  v_aula uuid;
  v_item jsonb;
begin
  select * into v_classe from public.ebd_classes where id = p_classe_id and deleted_at is null;
  if v_classe.id is null or not public.can_ebd_classe(p_classe_id) then
    raise exception 'classe nao encontrada' using errcode = 'P0002';
  end if;
  if p_data > current_date + 1 then
    raise exception 'aula de data futura' using errcode = 'check_violation';
  end if;

  insert into public.ebd_aulas (classe_id, church_id, data, licao, biblias, revistas, oferta_centavos, feita_por)
  values (p_classe_id, v_classe.church_id, p_data, nullif(trim(coalesce(p_licao, '')), ''),
          coalesce(p_biblias, 0), coalesce(p_revistas, 0), coalesce(p_oferta_centavos, 0), auth.uid())
  on conflict (classe_id, data) do update
    set licao = excluded.licao, biblias = excluded.biblias, revistas = excluded.revistas,
        oferta_centavos = excluded.oferta_centavos, feita_por = excluded.feita_por, updated_at = now()
  returning id into v_aula;

  delete from public.ebd_presencas where aula_id = v_aula;
  for v_item in select * from jsonb_array_elements(coalesce(p_presencas, '[]'::jsonb)) loop
    if not exists (
      select 1 from public.ebd_matriculas mt
      where mt.classe_id = p_classe_id and mt.membro_id = (v_item ->> 'membro_id')::uuid
        and mt.desde <= p_data and (mt.ate is null or mt.ate >= p_data)
    ) then
      raise exception 'aluno nao matriculado nesta classe na data' using errcode = 'check_violation';
    end if;
    insert into public.ebd_presencas (aula_id, membro_id, classe_id, church_id, estado)
    values (v_aula, (v_item ->> 'membro_id')::uuid, p_classe_id, v_classe.church_id, v_item ->> 'estado');
  end loop;

  delete from public.ebd_visitantes where aula_id = v_aula;
  insert into public.ebd_visitantes (aula_id, classe_id, church_id, nome, telefone, membro_id)
  select v_aula, p_classe_id, v_classe.church_id, trim(v ->> 'nome'), nullif(trim(coalesce(v ->> 'telefone', '')), ''),
         (select m.id from public.rol_membros m
           where m.id = nullif(v ->> 'membro_id', '')::uuid and m.church_id = v_classe.church_id)
  from jsonb_array_elements(coalesce(p_visitantes, '[]'::jsonb)) v;

  return v_aula;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'ebd_alunos_da_classe(uuid, date)', 'ebd_buscar_pessoas(uuid, text)', 'ebd_aulas_da_classe(uuid, int)',
    'ebd_resumo_do_dia(uuid, date)', 'ebd_resumo_do_membro(uuid)', 'minhas_empresas_professor_ebd()',
    'ebd_matricular(uuid, uuid)', 'ebd_matricular_novo(uuid, text, text, date, uuid)',
    'ebd_encerrar_matricula(uuid)', 'ebd_salvar_aula(uuid, date, text, int, int, int, jsonb, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Indicadores de Membros contam só o quadro de membros
-- ---------------------------------------------------------------------------
-- "Membros ativos" passa a ser quem faz parte do quadro; quem não faz
-- (crianças da EBD, congregados) aparece à parte.
drop function if exists public.membros_kpis(uuid);
create function public.membros_kpis(p_church_id uuid)
returns table (
  ativos int,
  inativos int,
  nao_membros int,
  novos_no_mes int,
  aniversariantes_do_mes int,
  com_cargo int,
  presenca_media numeric,
  em_alerta int
)
language sql
stable
security invoker
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
    (select count(*) from public.acompanhamento_alertas(p_church_id))::int;
$$;

revoke all on function public.membros_kpis(uuid) from public, anon, authenticated;
grant execute on function public.membros_kpis(uuid) to authenticated;

notify pgrst, 'reload schema';
