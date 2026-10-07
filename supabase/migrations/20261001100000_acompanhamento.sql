-- ---------------------------------------------------------------------------
-- Chamada e Acompanhamento
-- ---------------------------------------------------------------------------
-- Chamada de presença nos cultos, justificativas de ausência e o aviso de
-- membros com faltas seguidas, para o pastor entrar em contato.
--
-- CULTOS: vêm da Programação (church_schedule), não de um cadastro à parte.
-- Cada item da programação — semanal ou especial — tem `registra_chamada`
-- (padrão: sim). Só esses aparecem para chamada, e todo culto com chamada
-- feita conta para a sequência de faltas.
--
-- QUEM USA: owner/admin da igreja e quem o responsável autorizar
-- (`company_members.pode_acompanhar`, para um member). Cargo NÃO é
-- permissão: ser "Secretário" em church_leaders não abre nada sozinho.
--
-- LGPD: o rol de membros, a presença de cada um e o MOTIVO da ausência (saúde,
-- por exemplo) só são lidos por quem opera a PRÓPRIA igreja. A igreja de cima
-- (sede, subsede) não lê linha nenhuma destas tabelas: recebe apenas números
-- agregados por `acompanhamento_resumo_rede`, que confere a árvore.
--
-- REGRA DA SEQUÊNCIA (acompanhamento_alertas):
--   ausente      soma 1 falta
--   justificado  neutro: não soma e não zera
--   presente     zera
-- Uma ausência coberta por justificativa (mesmo registrada depois do culto)
-- conta como justificado — ver `acompanhamento_presencas_efetivas`.

-- ---------------------------------------------------------------------------
-- 0. Quem pode operar o acompanhamento
-- ---------------------------------------------------------------------------
alter table public.company_members
  add column if not exists pode_acompanhar boolean not null default false;

comment on column public.company_members.pode_acompanhar is
  'Member autorizado a fazer chamada e registrar justificativas/contatos. Owner/admin já podem.';

-- Só a PRÓPRIA igreja. A árvore não entra aqui de propósito (ver LGPD acima).
create or replace function public.can_acompanhar(p_church_id uuid)
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
      and c.company_id is not null
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
      and (cm.role in ('owner', 'admin') or cm.pode_acompanhar)
  );
$$;

revoke all on function public.can_acompanhar(uuid) from public, anon, authenticated;
grant execute on function public.can_acompanhar(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Rol de membros (não confundir com company_members, que é quem usa o sistema)
-- ---------------------------------------------------------------------------
create table if not exists public.rol_membros (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 120),
  whatsapp text check (whatsapp is null or char_length(whatsapp) between 8 and 20),
  nascimento date,
  ativo boolean not null default true,
  observacoes text check (observacoes is null or char_length(observacoes) <= 1000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.rol_membros is
  'Rol de membros da igreja para chamada e acompanhamento. Dado pessoal: só a própria igreja lê.';

create index if not exists rol_membros_church_idx
  on public.rol_membros (church_id, nome)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. Cultos = itens da Programação
-- ---------------------------------------------------------------------------
alter table public.church_schedule
  add column if not exists registra_chamada boolean not null default true;

comment on column public.church_schedule.registra_chamada is
  'Se este culto aparece na chamada. Padrão: sim (semanais e especiais).';

grant insert (registra_chamada) on public.church_schedule to authenticated;
grant update (registra_chamada) on public.church_schedule to authenticated;

-- A leitura pública da programação esconde itens removidos (e a do admin só
-- vale para owner/admin). Quem faz a chamada precisa ler o NOME de um culto
-- que saiu da programação, senão o histórico dele some dos relatórios.
drop policy if exists "church_schedule_select_acompanhar" on public.church_schedule;
create policy "church_schedule_select_acompanhar"
  on public.church_schedule for select
  to authenticated
  using (public.can_acompanhar(church_id));

-- ---------------------------------------------------------------------------
-- 3. Justificativas (antes da chamada, porque a presença aponta para ela)
-- ---------------------------------------------------------------------------
create table if not exists public.justificativas (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  membro_id uuid not null references public.rol_membros (id) on delete cascade,
  -- Dado sensível (saúde). Só a própria igreja lê — mesma regra da tabela.
  motivo text not null check (motivo in ('viagem', 'saude', 'trabalho', 'outro')),
  motivo_texto text check (motivo_texto is null or char_length(motivo_texto) <= 300),
  data_inicio date not null,
  data_fim date not null,
  encerrada_em timestamptz,
  criada_por uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint justificativas_periodo check (data_fim >= data_inicio),
  -- Período absurdo costuma ser erro de digitação (ano trocado).
  constraint justificativas_periodo_max check (data_fim - data_inicio <= 366)
);

create index if not exists justificativas_membro_periodo_idx
  on public.justificativas (membro_id, data_inicio, data_fim)
  where deleted_at is null;
create index if not exists justificativas_church_fim_idx
  on public.justificativas (church_id, data_fim)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 4. Chamadas, presenças e visitantes
-- ---------------------------------------------------------------------------
create table if not exists public.chamadas (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  -- O culto é o item da programação. Removê-lo da programação (soft delete)
  -- não apaga as chamadas: o histórico continua.
  schedule_id uuid not null references public.church_schedule (id) on delete cascade,
  data date not null,
  feita_por uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma chamada por culto e data: reabrir é editar a mesma.
create unique index if not exists chamadas_culto_data_idx
  on public.chamadas (schedule_id, data)
  where deleted_at is null;
create index if not exists chamadas_church_data_idx
  on public.chamadas (church_id, data desc)
  where deleted_at is null;

create table if not exists public.chamada_presencas (
  chamada_id uuid not null references public.chamadas (id) on delete cascade,
  membro_id uuid not null references public.rol_membros (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  estado text not null check (estado in ('presente', 'ausente', 'justificado')),
  justificativa_id uuid references public.justificativas (id) on delete set null,
  primary key (chamada_id, membro_id)
);

create index if not exists chamada_presencas_membro_idx on public.chamada_presencas (membro_id);

create table if not exists public.chamada_visitantes (
  id uuid primary key default gen_random_uuid(),
  chamada_id uuid not null references public.chamadas (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 120),
  telefone text check (telefone is null or char_length(telefone) between 8 and 20),
  created_at timestamptz not null default now()
);

create index if not exists chamada_visitantes_chamada_idx on public.chamada_visitantes (chamada_id);

-- ---------------------------------------------------------------------------
-- 5. Contatos do pastor e configuração por igreja
-- ---------------------------------------------------------------------------
create table if not exists public.acompanhamento_contatos (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  membro_id uuid not null references public.rol_membros (id) on delete cascade,
  -- De qual lista veio o contato: cada uma some com o seu.
  motivo text not null default 'faltas' check (motivo in ('faltas', 'justificativa_longa')),
  data date not null default current_date,
  resultado text not null
    check (resultado in ('retornou', 'em_acompanhamento', 'mudou_de_cidade', 'outro')),
  observacao text check (observacao is null or char_length(observacao) <= 1000),
  feito_por uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists acompanhamento_contatos_membro_idx
  on public.acompanhamento_contatos (membro_id, motivo, data desc)
  where deleted_at is null;

create table if not exists public.acompanhamento_config (
  church_id uuid primary key references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  faltas_alerta smallint not null default 3 check (faltas_alerta between 1 and 20),
  justificativa_longa_cultos smallint not null default 6 check (justificativa_longa_cultos between 1 and 50),
  justificativa_longa_dias smallint not null default 45 check (justificativa_longa_dias between 1 and 365),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. Triggers: company_id vem da igreja; igreja dos filhos vem do pai
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'rol_membros', 'justificativas', 'chamadas', 'chamada_presencas',
    'chamada_visitantes', 'acompanhamento_contatos', 'acompanhamento_config'
  ] loop
    execute format('drop trigger if exists set_%1$s_company_id on public.%1$s', t);
    execute format(
      'create trigger set_%1$s_company_id before insert or update of church_id on public.%1$s
         for each row execute function public.set_company_id_from_church()', t);
  end loop;

  foreach t in array array['rol_membros', 'justificativas', 'chamadas'] loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger set_%1$s_updated_at before update on public.%1$s
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Coerência entre tabelas: a RLS confere a igreja da linha, então a linha não
-- pode citar um culto/membro/chamada de OUTRA igreja (nem de outra rede).
create or replace function public.acompanhamento_confere_igreja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church uuid;
begin
  if tg_table_name = 'chamadas' then
    select church_id into v_church from public.church_schedule where id = new.schedule_id;
    if v_church is distinct from new.church_id then
      raise exception 'culto de outra igreja' using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'justificativas' or tg_table_name = 'acompanhamento_contatos' then
    select church_id into v_church from public.rol_membros where id = new.membro_id;
    if v_church is distinct from new.church_id then
      raise exception 'membro de outra igreja' using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'chamada_presencas' then
    select church_id into v_church from public.chamadas where id = new.chamada_id;
    if v_church is distinct from new.church_id then
      raise exception 'chamada de outra igreja' using errcode = 'check_violation';
    end if;
    select church_id into v_church from public.rol_membros where id = new.membro_id;
    if v_church is distinct from new.church_id then
      raise exception 'membro de outra igreja' using errcode = 'check_violation';
    end if;
    if new.justificativa_id is not null then
      select church_id into v_church from public.justificativas where id = new.justificativa_id;
      if v_church is distinct from new.church_id then
        raise exception 'justificativa de outra igreja' using errcode = 'check_violation';
      end if;
    end if;
  elsif tg_table_name = 'chamada_visitantes' then
    select church_id into v_church from public.chamadas where id = new.chamada_id;
    if v_church is distinct from new.church_id then
      raise exception 'chamada de outra igreja' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.acompanhamento_confere_igreja() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'chamadas', 'justificativas', 'acompanhamento_contatos', 'chamada_presencas', 'chamada_visitantes'
  ] loop
    execute format('drop trigger if exists %1$s_confere_igreja on public.%1$s', t);
    execute format(
      'create trigger %1$s_confere_igreja before insert or update on public.%1$s
         for each row execute function public.acompanhamento_confere_igreja()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. RLS: tudo só para quem opera a própria igreja
-- ---------------------------------------------------------------------------
-- Default privileges da plataforma dão ALL a anon/authenticated: revoga tudo
-- e concede só o necessário. Sem DELETE: remoção é soft delete (ou, nas
-- presenças/visitantes, regravação da chamada pela RPC salvar_chamada).
do $$
declare t text;
begin
  foreach t in array array[
    'rol_membros', 'justificativas', 'chamadas', 'chamada_presencas',
    'chamada_visitantes', 'acompanhamento_contatos', 'acompanhamento_config'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);

    execute format('drop policy if exists %1$s_select_own on public.%1$s', t);
    execute format(
      'create policy %1$s_select_own on public.%1$s for select to authenticated
         using (public.can_acompanhar(church_id))', t);

    execute format('drop policy if exists %1$s_insert_own on public.%1$s', t);
    execute format(
      'create policy %1$s_insert_own on public.%1$s for insert to authenticated
         with check (public.can_acompanhar(church_id))', t);

    execute format('drop policy if exists %1$s_update_own on public.%1$s', t);
    execute format(
      'create policy %1$s_update_own on public.%1$s for update to authenticated
         using (public.can_acompanhar(church_id)) with check (public.can_acompanhar(church_id))', t);
  end loop;
end $$;

-- Colunas preenchidas pelo sistema (company_id, criada_por, feita_por) ficam
-- fora dos GRANTs: ninguém "assina" um registro em nome de outra pessoa.
grant insert (church_id, nome, whatsapp, nascimento, ativo, observacoes) on public.rol_membros to authenticated;
grant update (nome, whatsapp, nascimento, ativo, observacoes, deleted_at) on public.rol_membros to authenticated;

grant insert (church_id, membro_id, motivo, motivo_texto, data_inicio, data_fim) on public.justificativas to authenticated;
grant update (motivo, motivo_texto, data_inicio, data_fim, encerrada_em, deleted_at) on public.justificativas to authenticated;

grant insert (church_id, membro_id, motivo, data, resultado, observacao) on public.acompanhamento_contatos to authenticated;
grant update (deleted_at) on public.acompanhamento_contatos to authenticated;

grant insert (church_id, faltas_alerta, justificativa_longa_cultos, justificativa_longa_dias)
  on public.acompanhamento_config to authenticated;
grant update (faltas_alerta, justificativa_longa_cultos, justificativa_longa_dias, updated_at)
  on public.acompanhamento_config to authenticated;

-- Chamadas, presenças e visitantes só mudam pela RPC salvar_chamada (uma
-- transação). O client só lê; a RPC é security invoker, então a RLS acima
-- continua valendo dentro dela, e os GRANTs abaixo são o que ela usa.
grant insert (church_id, schedule_id, data) on public.chamadas to authenticated;
grant update (updated_at, deleted_at) on public.chamadas to authenticated;
grant insert (chamada_id, membro_id, church_id, estado, justificativa_id) on public.chamada_presencas to authenticated;
grant delete on public.chamada_presencas to authenticated;
grant insert (chamada_id, church_id, nome, telefone) on public.chamada_visitantes to authenticated;
grant delete on public.chamada_visitantes to authenticated;

drop policy if exists chamada_presencas_delete_own on public.chamada_presencas;
create policy chamada_presencas_delete_own on public.chamada_presencas for delete to authenticated
  using (public.can_acompanhar(church_id));
drop policy if exists chamada_visitantes_delete_own on public.chamada_visitantes;
create policy chamada_visitantes_delete_own on public.chamada_visitantes for delete to authenticated
  using (public.can_acompanhar(church_id));

-- ---------------------------------------------------------------------------
-- 8. Presença efetiva: ausência coberta por justificativa vira "justificado"
-- ---------------------------------------------------------------------------
-- security_invoker: a view obedece a RLS de quem consulta.
create or replace view public.acompanhamento_presencas_efetivas
with (security_invoker = true)
as
select
  p.chamada_id,
  p.membro_id,
  ch.church_id,
  ch.schedule_id,
  ch.data,
  -- Ordena dois cultos no mesmo dia (manhã e noite).
  ch.data + s.hora as momento,
  case
    when p.estado = 'ausente' and exists (
      select 1 from public.justificativas j
      where j.membro_id = p.membro_id
        and j.deleted_at is null
        and ch.data between j.data_inicio and j.data_fim
    ) then 'justificado'
    else p.estado
  end as estado
from public.chamada_presencas p
join public.chamadas ch on ch.id = p.chamada_id and ch.deleted_at is null
join public.church_schedule s on s.id = ch.schedule_id;

revoke all on public.acompanhamento_presencas_efetivas from anon, authenticated;
grant select on public.acompanhamento_presencas_efetivas to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Salvar a chamada (cria ou reabre), numa transação só
-- ---------------------------------------------------------------------------
-- p_presencas: [{membro_id, estado, justificativa_id?, motivo?, motivo_texto?}]
--   estado = 'justificado' sem justificativa_id e com motivo cria uma
--   justificativa de um dia (a data do culto).
-- p_visitantes: [{nome, telefone?}] — substitui os visitantes da chamada.
create or replace function public.salvar_chamada(
  p_schedule_id uuid,
  p_data date,
  p_presencas jsonb,
  p_visitantes jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_culto public.church_schedule%rowtype;
  v_chamada uuid;
  v_item jsonb;
  v_justificativa uuid;
begin
  select * into v_culto from public.church_schedule where id = p_schedule_id;
  if v_culto.id is null or not public.can_acompanhar(v_culto.church_id) then
    raise exception 'culto nao encontrado' using errcode = 'P0002';
  end if;
  if p_data > current_date + 1 then
    raise exception 'chamada de data futura' using errcode = 'check_violation';
  end if;

  select id into v_chamada from public.chamadas
  where schedule_id = p_schedule_id and data = p_data and deleted_at is null;

  -- Chamada NOVA só para culto ativo, marcado para chamada, no dia certo.
  -- Reabrir uma já feita continua valendo mesmo se o culto mudou depois.
  if v_chamada is null then
    if v_culto.deleted_at is not null or not v_culto.registra_chamada then
      raise exception 'culto sem chamada' using errcode = 'check_violation';
    end if;
    if (v_culto.tipo = 'especial' and p_data <> v_culto.data)
       or (v_culto.tipo = 'semanal' and extract(dow from p_data)::int <> v_culto.dia_semana) then
      raise exception 'data nao corresponde ao culto' using errcode = 'check_violation';
    end if;
    insert into public.chamadas (church_id, schedule_id, data)
    values (v_culto.church_id, p_schedule_id, p_data)
    returning id into v_chamada;
  else
    update public.chamadas set updated_at = now() where id = v_chamada;
    delete from public.chamada_presencas where chamada_id = v_chamada;
    delete from public.chamada_visitantes where chamada_id = v_chamada;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_presencas, '[]'::jsonb)) loop
    v_justificativa := nullif(v_item ->> 'justificativa_id', '')::uuid;

    if v_item ->> 'estado' = 'justificado' and v_justificativa is null then
      -- Reaproveita uma justificativa que já cobre a data; senão cria a de um dia.
      select id into v_justificativa from public.justificativas
      where membro_id = (v_item ->> 'membro_id')::uuid
        and deleted_at is null
        and p_data between data_inicio and data_fim
      order by data_inicio desc
      limit 1;

      if v_justificativa is null then
        insert into public.justificativas (church_id, membro_id, motivo, motivo_texto, data_inicio, data_fim)
        values (
          v_culto.church_id,
          (v_item ->> 'membro_id')::uuid,
          coalesce(nullif(v_item ->> 'motivo', ''), 'outro'),
          nullif(v_item ->> 'motivo_texto', ''),
          p_data,
          p_data
        )
        returning id into v_justificativa;
      end if;
    elsif v_item ->> 'estado' <> 'justificado' then
      v_justificativa := null;
    end if;

    insert into public.chamada_presencas (chamada_id, membro_id, church_id, estado, justificativa_id)
    values (v_chamada, (v_item ->> 'membro_id')::uuid, v_culto.church_id, v_item ->> 'estado', v_justificativa);
  end loop;

  insert into public.chamada_visitantes (chamada_id, church_id, nome, telefone)
  select v_chamada, v_culto.church_id, trim(v ->> 'nome'), nullif(trim(v ->> 'telefone'), '')
  from jsonb_array_elements(coalesce(p_visitantes, '[]'::jsonb)) v;

  return v_chamada;
end;
$$;

revoke all on function public.salvar_chamada(uuid, date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_chamada(uuid, date, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Configuração efetiva (padrão quando a igreja não salvou nada)
-- ---------------------------------------------------------------------------
create or replace function public.acompanhamento_config_de(p_church_id uuid)
returns public.acompanhamento_config
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select c from public.acompanhamento_config c where c.church_id = p_church_id),
    row(p_church_id, null, 3, 6, 45, now())::public.acompanhamento_config
  );
$$;

revoke all on function public.acompanhamento_config_de(uuid) from public, anon, authenticated;
grant execute on function public.acompanhamento_config_de(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Membros em alerta (faltas seguidas)
-- ---------------------------------------------------------------------------
-- Para cada membro ativo: olha só as chamadas DEPOIS da última presença e
-- conta as ausências. Justificado fica no meio
-- sem somar nem zerar. Um índice por membro + uma agregação: cresce com o
-- tamanho da igreja, não da rede.
--
-- Situação:
--   pendente           ainda ninguém falou com ele depois da última falta
--   em_acompanhamento  último contato foi "em acompanhamento"
-- Contato com outro resultado, feito depois da última falta, tira da lista;
-- uma falta nova depois do contato traz de volta.
create or replace function public.acompanhamento_alertas(p_church_id uuid)
returns table (
  membro_id uuid,
  nome text,
  whatsapp text,
  faltas_seguidas int,
  ultima_presenca date,
  ultima_falta date,
  contato_data date,
  contato_resultado text,
  situacao text
)
language sql
stable
security invoker
set search_path = public
as $$
  with cfg as (
    select * from public.acompanhamento_config_de(p_church_id)
  ),
  pres as (
    select e.membro_id, e.momento, e.data, e.estado
    from public.acompanhamento_presencas_efetivas e
    where e.church_id = p_church_id
  ),
  ultima_presenca as (
    select membro_id, max(momento) as momento, max(data) as data
    from pres where estado = 'presente'
    group by membro_id
  ),
  sequencia as (
    select p.membro_id,
           count(*) filter (where p.estado = 'ausente')::int as faltas,
           max(p.data) filter (where p.estado = 'ausente') as ultima_falta
    from pres p
    left join ultima_presenca u on u.membro_id = p.membro_id
    where p.momento > coalesce(u.momento, '-infinity'::timestamp)
    group by p.membro_id
  ),
  contato as (
    select distinct on (c.membro_id) c.membro_id, c.data, c.resultado
    from public.acompanhamento_contatos c
    where c.church_id = p_church_id and c.deleted_at is null and c.motivo = 'faltas'
    order by c.membro_id, c.data desc, c.created_at desc
  )
  select m.id, m.nome, m.whatsapp, s.faltas, u.data, s.ultima_falta, c.data, c.resultado,
         case when c.data >= s.ultima_falta and c.resultado = 'em_acompanhamento'
              then 'em_acompanhamento' else 'pendente' end
  from sequencia s
  join public.rol_membros m on m.id = s.membro_id and m.deleted_at is null and m.ativo
  left join ultima_presenca u on u.membro_id = s.membro_id
  left join contato c on c.membro_id = s.membro_id
  cross join cfg
  where s.faltas >= cfg.faltas_alerta
    and (c.data is null or c.data < s.ultima_falta or c.resultado = 'em_acompanhamento')
  order by s.faltas desc, m.nome;
$$;

revoke all on function public.acompanhamento_alertas(uuid) from public, anon, authenticated;
grant execute on function public.acompanhamento_alertas(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Justificativas longas
-- ---------------------------------------------------------------------------
-- Sequência de "justificado" desde a última chamada em que o membro esteve
-- presente OU ausente.
-- Também entra quem tem uma justificativa em curso há mais de Y dias, mesmo
-- sem chamada no período. Contato depois do início da sequência tira da
-- lista, salvo "em acompanhamento".
create or replace function public.acompanhamento_justificativas_longas(p_church_id uuid)
returns table (
  membro_id uuid,
  nome text,
  whatsapp text,
  cultos_justificados int,
  desde date,
  dias int,
  ultima_presenca date,
  contato_data date,
  contato_resultado text,
  situacao text
)
language sql
stable
security invoker
set search_path = public
as $$
  with cfg as (
    select * from public.acompanhamento_config_de(p_church_id)
  ),
  pres as (
    select e.membro_id, e.momento, e.data, e.estado
    from public.acompanhamento_presencas_efetivas e
    where e.church_id = p_church_id
  ),
  ultima_nao_justificada as (
    select membro_id, max(momento) as momento
    from pres where estado <> 'justificado'
    group by membro_id
  ),
  ultima_presenca as (
    select membro_id, max(data) as data from pres where estado = 'presente' group by membro_id
  ),
  sequencia as (
    select p.membro_id, count(*)::int as cultos, min(p.data) as desde
    from pres p
    left join ultima_nao_justificada u on u.membro_id = p.membro_id
    where p.estado = 'justificado' and p.momento > coalesce(u.momento, '-infinity'::timestamp)
    group by p.membro_id
  ),
  em_curso as (
    select j.membro_id, min(j.data_inicio) as desde
    from public.justificativas j
    where j.church_id = p_church_id and j.deleted_at is null
      and current_date between j.data_inicio and j.data_fim
    group by j.membro_id
  ),
  juntos as (
    select coalesce(s.membro_id, e.membro_id) as membro_id,
           coalesce(s.cultos, 0) as cultos,
           least(s.desde, e.desde) as desde
    from sequencia s
    full join em_curso e on e.membro_id = s.membro_id
  ),
  contato as (
    select distinct on (c.membro_id) c.membro_id, c.data, c.resultado
    from public.acompanhamento_contatos c
    where c.church_id = p_church_id and c.deleted_at is null and c.motivo = 'justificativa_longa'
    order by c.membro_id, c.data desc, c.created_at desc
  )
  select m.id, m.nome, m.whatsapp, j.cultos, j.desde, (current_date - j.desde)::int, u.data,
         c.data, c.resultado,
         case when c.data >= j.desde and c.resultado = 'em_acompanhamento'
              then 'em_acompanhamento' else 'pendente' end
  from juntos j
  join public.rol_membros m on m.id = j.membro_id and m.deleted_at is null and m.ativo
  left join ultima_presenca u on u.membro_id = j.membro_id
  left join contato c on c.membro_id = j.membro_id
  cross join cfg
  where (j.cultos > cfg.justificativa_longa_cultos or current_date - j.desde > cfg.justificativa_longa_dias)
    and (c.data is null or c.data < j.desde or c.resultado = 'em_acompanhamento')
  order by j.desde, m.nome;
$$;

revoke all on function public.acompanhamento_justificativas_longas(uuid) from public, anon, authenticated;
grant execute on function public.acompanhamento_justificativas_longas(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Relatórios
-- ---------------------------------------------------------------------------
-- Presença por chamada: presentes, justificados e ausentes SEPARADOS.
create or replace function public.acompanhamento_relatorio_chamadas(p_church_id uuid, p_de date, p_ate date)
returns table (
  chamada_id uuid,
  schedule_id uuid,
  culto_nome text,
  data date,
  presentes int,
  justificados int,
  ausentes int,
  visitantes int
)
language sql
stable
security invoker
set search_path = public
as $$
  select ch.id, s.id, s.titulo, ch.data,
         count(*) filter (where e.estado = 'presente')::int,
         count(*) filter (where e.estado = 'justificado')::int,
         count(*) filter (where e.estado = 'ausente')::int,
         (select count(*) from public.chamada_visitantes v where v.chamada_id = ch.id)::int
  from public.chamadas ch
  join public.church_schedule s on s.id = ch.schedule_id
  left join public.acompanhamento_presencas_efetivas e on e.chamada_id = ch.id
  where ch.church_id = p_church_id and ch.deleted_at is null
    and ch.data between p_de and p_ate
  group by ch.id, s.id, s.titulo, ch.data, s.hora
  order by ch.data desc, s.hora desc;
$$;

-- Frequência por membro: % de presença só sobre cultos SEM justificativa.
create or replace function public.acompanhamento_frequencia(p_church_id uuid, p_de date, p_ate date)
returns table (
  membro_id uuid,
  nome text,
  ativo boolean,
  presentes int,
  justificados int,
  ausentes int,
  percentual numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select m.id, m.nome, m.ativo,
         count(*) filter (where e.estado = 'presente')::int,
         count(*) filter (where e.estado = 'justificado')::int,
         count(*) filter (where e.estado = 'ausente')::int,
         round(100.0 * count(*) filter (where e.estado = 'presente')
               / nullif(count(*) filter (where e.estado in ('presente', 'ausente')), 0), 1)
  from public.rol_membros m
  left join public.acompanhamento_presencas_efetivas e
    on e.membro_id = m.id and e.data between p_de and p_ate
  where m.church_id = p_church_id and m.deleted_at is null
  group by m.id, m.nome, m.ativo
  order by m.nome;
$$;

revoke all on function public.acompanhamento_relatorio_chamadas(uuid, date, date) from public, anon, authenticated;
revoke all on function public.acompanhamento_frequencia(uuid, date, date) from public, anon, authenticated;
grant execute on function public.acompanhamento_relatorio_chamadas(uuid, date, date) to authenticated;
grant execute on function public.acompanhamento_frequencia(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 14. Resumo da igreja (dashboard) e da rede (só números)
-- ---------------------------------------------------------------------------
create or replace function public.acompanhamento_resumo(p_church_id uuid)
returns table (
  ultima_chamada_data date,
  ultimo_culto_nome text,
  presentes int,
  justificados int,
  ausentes int,
  visitantes int,
  membros_ativos int,
  em_alerta int,
  justificativas_longas int,
  contatos_pendentes int
)
language sql
stable
security invoker
set search_path = public
as $$
  with ultima as (
    select r.* from public.acompanhamento_relatorio_chamadas(p_church_id, current_date - 365, current_date + 1) r
    order by r.data desc
    limit 1
  ),
  alertas as (select * from public.acompanhamento_alertas(p_church_id)),
  longas as (select * from public.acompanhamento_justificativas_longas(p_church_id))
  select u.data, u.culto_nome,
         coalesce(u.presentes, 0), coalesce(u.justificados, 0), coalesce(u.ausentes, 0), coalesce(u.visitantes, 0),
         (select count(*) from public.rol_membros m
           where m.church_id = p_church_id and m.deleted_at is null and m.ativo)::int,
         (select count(*) from alertas)::int,
         (select count(*) from longas)::int,
         ((select count(*) from alertas where situacao = 'pendente')
          + (select count(*) from longas where situacao = 'pendente'))::int
  from (select 1) x
  left join ultima u on true;
$$;

revoke all on function public.acompanhamento_resumo(uuid) from public, anon, authenticated;
grant execute on function public.acompanhamento_resumo(uuid) to authenticated;

-- A igreja de cima vê só NÚMEROS das de baixo (LGPD): nenhum nome, nenhum
-- motivo. security definer para atravessar a RLS das tabelas, conferindo a
-- árvore igreja por igreja com can_admin_view_church.
create or replace function public.acompanhamento_resumo_rede(p_church_id uuid)
returns table (
  church_id uuid,
  church_name text,
  tipo text,
  ultima_chamada_data date,
  presentes int,
  justificados int,
  ausentes int,
  membros_ativos int,
  em_alerta int
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.name, d.tipo, r.ultima_chamada_data, r.presentes, r.justificados, r.ausentes,
         r.membros_ativos, r.em_alerta
  from public.churches raiz
  join public.churches d on d.path <@ raiz.path and d.id <> raiz.id and d.deleted_at is null
  cross join lateral public.acompanhamento_resumo(d.id) r
  where raiz.id = p_church_id
    and raiz.deleted_at is null
    and public.can_admin_view_church(raiz.id)
  order by d.path;
$$;

revoke all on function public.acompanhamento_resumo_rede(uuid) from public, anon, authenticated;
grant execute on function public.acompanhamento_resumo_rede(uuid) to authenticated;

notify pgrst, 'reload schema';
