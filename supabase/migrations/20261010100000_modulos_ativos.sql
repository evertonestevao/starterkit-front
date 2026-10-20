-- ---------------------------------------------------------------------------
-- Módulos ativos por igreja: liga/desliga acima do cargo
-- ---------------------------------------------------------------------------
-- Até aqui o Responsável só controlava QUEM, dentro da igreja, acessa cada
-- módulo (cargo_acessos). Muitas igrejas simplesmente não usam um módulo
-- inteiro (EBD, Presença nos cultos...) e a única forma de "esconder" era
-- desligar o módulo de TODOS os cargos, inclusive o próprio — fácil de
-- esquecer e não impedia nada de verdade no banco.
--
-- Agora existe um liga/desliga POR IGREJA, acima do cargo: desligou, ninguém
-- acessa, nem o Responsável — e o módulo nem aparece como opção de cargo pra
-- marcar (isso é só UI, resolvido em src/lib/menuPermissoes.ts). A sede
-- define um padrão e a rede inteira segue, com a MESMA regra de herança de
-- cargo_acessos: a definição mais próxima (a própria igreja, a mãe, a
-- avó...) vence; sem nenhuma, o módulo está ativo (preserva o comportamento
-- de quem já existe).
--
-- Módulos que podem ser desligados: acompanhamento, ebd, programacao,
-- events, campaigns, relationships, tesouraria. "dashboard" e "membros"
-- ficam de fora — são a base do sistema e continuam sempre ligados.

create table public.church_modulos (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  modulo text not null check (
    modulo in ('acompanhamento', 'ebd', 'programacao', 'events', 'campaigns', 'relationships', 'tesouraria')
  ),
  ativo boolean not null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (church_id, modulo)
);

create index church_modulos_company_idx on public.church_modulos (company_id);

create trigger set_church_modulos_company_id
  before insert or update of church_id on public.church_modulos
  for each row execute function public.set_company_id_from_church();

alter table public.church_modulos enable row level security;

-- Tabela nasce com ALL para anon/authenticated: tira tudo. Ninguém lê nem
-- escreve direto; tudo passa pelas funções abaixo.
revoke all on public.church_modulos from anon, authenticated;

create policy "church_modulos_select_admin"
  on public.church_modulos for select
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id));

-- ---------------------------------------------------------------------------
-- 1. O módulo está ativo nesta igreja? (regra única, sem depender de quem pergunta)
-- ---------------------------------------------------------------------------
-- A definição mais próxima vence (a própria igreja, a mãe, a avó...); sem
-- nenhuma, o módulo está ativo. Módulo fora do catálogo acima (dashboard,
-- membros...) nunca tem linha aqui, então sempre vale "ativo".
create or replace function public.modulo_ativo(p_company_id uuid, p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select cm.ativo
      from public.churches minha
      join public.churches acima on minha.path <@ acima.path and acima.deleted_at is null
      join public.church_modulos cm on cm.church_id = acima.id and cm.deleted_at is null
      where minha.company_id = p_company_id
        and minha.deleted_at is null
        and cm.modulo = p_modulo
      order by nlevel(acima.path) desc
      limit 1
    ),
    true
  );
$$;

-- Só uso interno (outras funções definer e esta migration).
revoke all on function public.modulo_ativo(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. tem_acesso() passa a exigir o módulo ativo, mesmo para quem administra
-- ---------------------------------------------------------------------------
-- Cobre programacao, events, campaigns, relationships e tesouraria, que já
-- checam tem_acesso() direto nas policies deles.
create or replace function public.tem_acesso(p_company_id uuid, p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.modulo_ativo(p_company_id, p_modulo)
    and (public.is_company_admin(p_company_id) or public.tem_acesso_por_cargo(p_company_id, p_modulo));
$$;

-- ---------------------------------------------------------------------------
-- 3. EBD: can_gerir_ebd e can_ebd_classe (o professor também fica de fora)
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
      and public.modulo_ativo(c.company_id, 'ebd')
      and (cm.role in ('owner', 'admin') or public.tem_acesso_por_cargo(c.company_id, 'ebd'))
  );
$$;

-- A classe é visível para a gestão da EBD da igreja ou para um professor
-- dela — mas só com o módulo ligado: EBD desligada tira até o professor.
create or replace function public.can_ebd_classe(p_classe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ebd_classes k
    join public.churches c on c.id = k.church_id
    where k.id = p_classe_id and k.deleted_at is null
      and c.company_id is not null
      and public.modulo_ativo(c.company_id, 'ebd')
      and (
        public.can_gerir_ebd(k.church_id)
        or exists (
          select 1
          from public.ebd_professores p
          join public.rol_membros m on m.id = p.membro_id and m.deleted_at is null
          join public.company_members cm on cm.company_id = c.company_id
            and cm.user_id = m.user_id and cm.deleted_at is null
          where p.classe_id = k.id and m.user_id = auth.uid()
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Presença nos cultos: a chamada separada do cadastro de membros
-- ---------------------------------------------------------------------------
-- can_acompanhar governa TAMBÉM o rol_membros (Membros, que não é
-- desligável) — por isso continua do jeito que está, sem o gate. As tabelas
-- de chamada/justificativa é que ganham uma trava própria, que soma o módulo
-- ativo por cima do que can_acompanhar já decide (owner/admin incluso).
create or replace function public.can_fazer_chamada(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_acompanhar(p_church_id)
    and exists (
      select 1 from public.churches c
      where c.id = p_church_id
        and c.company_id is not null
        and public.modulo_ativo(c.company_id, 'acompanhamento')
    );
$$;

revoke all on function public.can_fazer_chamada(uuid) from public, anon, authenticated;
grant execute on function public.can_fazer_chamada(uuid) to authenticated;

-- Reaponta select/insert/update das 6 tabelas de chamada (rol_membros FICA
-- de fora, de propósito) para a nova trava.
do $$
declare t text;
begin
  foreach t in array array[
    'justificativas', 'chamadas', 'chamada_presencas',
    'chamada_visitantes', 'acompanhamento_contatos', 'acompanhamento_config'
  ] loop
    execute format('drop policy if exists %1$s_select_own on public.%1$s', t);
    execute format(
      'create policy %1$s_select_own on public.%1$s for select to authenticated
         using (public.can_fazer_chamada(church_id))', t);

    execute format('drop policy if exists %1$s_insert_own on public.%1$s', t);
    execute format(
      'create policy %1$s_insert_own on public.%1$s for insert to authenticated
         with check (public.can_fazer_chamada(church_id))', t);

    execute format('drop policy if exists %1$s_update_own on public.%1$s', t);
    execute format(
      'create policy %1$s_update_own on public.%1$s for update to authenticated
         using (public.can_fazer_chamada(church_id)) with check (public.can_fazer_chamada(church_id))', t);
  end loop;
end $$;

drop policy if exists chamada_presencas_delete_own on public.chamada_presencas;
create policy chamada_presencas_delete_own on public.chamada_presencas for delete to authenticated
  using (public.can_fazer_chamada(church_id));
drop policy if exists chamada_visitantes_delete_own on public.chamada_visitantes;
create policy chamada_visitantes_delete_own on public.chamada_visitantes for delete to authenticated
  using (public.can_fazer_chamada(church_id));

-- Leitura do título do culto para rotular a chamada: mesma trava.
drop policy if exists "church_schedule_select_acompanhar" on public.church_schedule;
create policy "church_schedule_select_acompanhar"
  on public.church_schedule for select
  to authenticated
  using (public.can_fazer_chamada(church_id));

-- salvar_chamada é security invoker: a RLS acima já barraria a escrita, mas
-- este early-check dá uma mensagem clara em vez de um erro genérico de RLS.
-- Corpo idêntico ao original (20261001100000_acompanhamento.sql): só a
-- checagem da linha seguinte troca can_acompanhar por can_fazer_chamada.
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
  if v_culto.id is null or not public.can_fazer_chamada(v_culto.church_id) then
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

-- ---------------------------------------------------------------------------
-- 5. Configuração (Responsável OU Administrador)
-- ---------------------------------------------------------------------------
-- Linhas da própria igreja (nivel 0) e das acima (1 = mãe, 2 = avó...).
create or replace function public.modulos_ativos_da_rede(p_company_id uuid)
returns table (modulo text, ativo boolean, nivel int, igreja text)
language sql
stable
security definer
set search_path = public
as $$
  select cm.modulo, cm.ativo,
         nlevel(minha.path) - nlevel(acima.path) as nivel,
         acima.name as igreja
  from public.churches minha
  join public.churches acima on minha.path <@ acima.path and acima.deleted_at is null
  join public.church_modulos cm on cm.church_id = acima.id and cm.deleted_at is null
  where minha.company_id = p_company_id
    and minha.deleted_at is null
    and public.is_company_admin(p_company_id);
$$;

revoke all on function public.modulos_ativos_da_rede(uuid) from public, anon, authenticated;
grant execute on function public.modulos_ativos_da_rede(uuid) to authenticated;

-- Grava o conjunto de exceções da PRÓPRIA igreja (substitui o anterior).
-- Responsável ou Administrador — diferente de salvar_cargo_acessos, que é
-- só do Responsável: aqui o pedido foi que quem administra também possa.
create or replace function public.salvar_modulos_ativos(p_company_id uuid, p_itens jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church uuid;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'apenas quem administra altera os módulos' using errcode = '42501';
  end if;

  -- A igreja mais alta da empresa (uma empresa costuma ter uma só; com mais
  -- de uma, a de cima é a que vale para as outras). created_at sozinho não
  -- desempata: igrejas criadas na mesma transação têm o mesmo horário.
  select id into v_church
  from public.churches
  where company_id = p_company_id and deleted_at is null
  order by nlevel(path), created_at, id
  limit 1;
  if v_church is null then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) > 50 then
    raise exception 'lista de módulos inválida' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_itens) as i(modulo text, ativo boolean)
    where i.modulo not in (
      'acompanhamento', 'ebd', 'programacao', 'events', 'campaigns', 'relationships', 'tesouraria'
    )
  ) then
    raise exception 'módulo inválido' using errcode = '22023';
  end if;

  delete from public.church_modulos where church_id = v_church;

  insert into public.church_modulos (church_id, modulo, ativo, updated_by)
  select v_church, i.modulo, i.ativo, auth.uid()
  from jsonb_to_recordset(p_itens) as i(modulo text, ativo boolean)
  where i.modulo is not null and i.ativo is not null;
end;
$$;

revoke all on function public.salvar_modulos_ativos(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_modulos_ativos(uuid, jsonb) to authenticated;

-- Módulos ativos (dos togglável) em cada empresa do usuário — o app monta o
-- menu com isto, junto de meus_acessos().
create or replace function public.modulos_ativos()
returns table (company_id uuid, modulo text)
language sql
stable
security definer
set search_path = public
as $$
  select cm.company_id, mod.modulo
  from public.company_members cm
  cross join unnest(array[
    'acompanhamento', 'ebd', 'programacao', 'events', 'campaigns', 'relationships', 'tesouraria'
  ]) as mod(modulo)
  where cm.user_id = auth.uid()
    and cm.deleted_at is null
    and public.modulo_ativo(cm.company_id, mod.modulo);
$$;

revoke all on function public.modulos_ativos() from public, anon, authenticated;
grant execute on function public.modulos_ativos() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Onboarding: escolher já na criação quais módulos ficam desligados
-- ---------------------------------------------------------------------------
drop function if exists public.create_company_with_church(text, text, text, boolean, text);

create or replace function public.create_company_with_church(
  p_name text,
  p_slug text,
  p_sobrenome text default null,
  p_faz_parte_de_rede boolean default false,
  p_rede_nome text default null,
  p_modulos_inativos text[] default '{}'
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies;
  v_church_slug text;
  v_church_id uuid;
  v_sobrenome text := nullif(btrim(coalesce(p_sobrenome, '')), '');
  v_faz_parte boolean := coalesce(p_faz_parte_de_rede, false);
  v_rede text := nullif(btrim(coalesce(p_rede_nome, '')), '');
begin
  if v_sobrenome is not null and char_length(v_sobrenome) > 120 then
    raise exception 'complemento do nome muito longo' using errcode = '23514';
  end if;
  if v_rede is not null and char_length(v_rede) > 120 then
    raise exception 'nome da rede muito longo' using errcode = '23514';
  end if;
  -- Nome de rede sem marcar que faz parte de uma: descarta em vez de gravar torto.
  if not v_faz_parte then
    v_rede := null;
  end if;

  insert into public.companies (name, slug, created_by)
  values (p_name, p_slug, auth.uid())
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company.id, auth.uid(), 'owner');

  v_church_slug := public.next_available_church_slug(p_slug);

  -- A igreja herda o nome digitado no onboarding. `path` é preenchido pelo
  -- trigger sync_church_path; `nome_proprio` pelo sync_church_name.
  insert into public.churches (
    company_id, name, sobrenome, slug, public_code, path, faz_parte_de_rede, rede_nome
  )
  values (
    v_company.id, p_name, v_sobrenome, v_church_slug, v_church_slug, v_church_slug::ltree,
    v_faz_parte, v_rede
  )
  returning id into v_church_id;

  -- Só os desmarcados precisam de linha: ausência já significa "ativo".
  if p_modulos_inativos is not null and array_length(p_modulos_inativos, 1) > 0 then
    insert into public.church_modulos (church_id, modulo, ativo, updated_by)
    select v_church_id, m, false, auth.uid()
    from unnest(p_modulos_inativos) as m
    where m in ('acompanhamento', 'ebd', 'programacao', 'events', 'campaigns', 'relationships', 'tesouraria');
  end if;

  return v_company;
end;
$$;

revoke all on function public.create_company_with_church(text, text, text, boolean, text, text[]) from public, anon, authenticated;
grant execute on function public.create_company_with_church(text, text, text, boolean, text, text[]) to authenticated;

notify pgrst, 'reload schema';
