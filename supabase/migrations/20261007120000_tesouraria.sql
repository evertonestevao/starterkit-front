-- Tesouraria: dízimos e ofertas dos cultos.
--
-- Um lançamento simples por entrada — o dízimo de uma pessoa, ou a oferta de
-- um culto — com relatório mensal. Não é um financeiro (não há despesas,
-- contas nem saldo). A oferta da EBD continua em `ebd_aulas`: é outro caixa e
-- não entra aqui.
--
-- Quem acessa: quem administra a igreja ou tem um cargo com o módulo
-- "tesouraria" liberado (por padrão, o Tesoureiro). Só a PRÓPRIA igreja: a
-- igreja de cima não lê os dízimos da de baixo.
--
-- O nome do dizimista fica gravado no lançamento (além do vínculo com o
-- membro): o tesoureiro não precisa do módulo Membros para lançar, e o
-- registro continua legível se a pessoa sair do rol.

-- ---------------------------------------------------------------------------
-- 1. O módulo entra na lista dos liberáveis por cargo
-- ---------------------------------------------------------------------------
alter table public.cargo_acessos drop constraint cargo_acessos_modulo_check;
alter table public.cargo_acessos add constraint cargo_acessos_modulo_check check (
  modulo in ('dashboard', 'acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns', 'relationships',
             'tesouraria')
);

alter table public.cargos drop constraint cargos_acessos_padrao_check;
alter table public.cargos add constraint cargos_acessos_padrao_check check (
  acessos_padrao <@ array['dashboard', 'acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns',
                          'relationships', 'tesouraria']
);

-- Padrão: só o Tesoureiro. Os demais cargos a igreja libera em Configurações → Acessos.
update public.cargos set acessos_padrao = acessos_padrao || array['tesouraria']
where church_id is null and slug = 'tesoureiro' and not ('tesouraria' = any (acessos_padrao));

create or replace function public.meus_acessos()
returns table (company_id uuid, modulo text)
language sql
stable
security definer
set search_path = public
as $$
  select cm.company_id, mod.modulo
  from public.company_members cm
  cross join unnest(array['dashboard', 'acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns',
                          'relationships', 'tesouraria'])
    as mod(modulo)
  where cm.user_id = auth.uid()
    and cm.deleted_at is null
    and public.tem_acesso_por_cargo(cm.company_id, mod.modulo);
$$;

-- ---------------------------------------------------------------------------
-- 2. Lançamentos
-- ---------------------------------------------------------------------------
create table public.tesouraria_lancamentos (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  data date not null,
  -- O culto é um item da programação. O título fica copiado: se o culto sair
  -- da programação, o lançamento continua dizendo de onde veio.
  schedule_id uuid references public.church_schedule (id) on delete set null,
  culto_titulo text check (culto_titulo is null or char_length(culto_titulo) <= 80),
  tipo text not null check (tipo in ('dizimo', 'oferta')),
  valor_centavos integer not null check (valor_centavos > 0 and valor_centavos <= 100000000),
  forma text not null default 'dinheiro' check (forma in ('dinheiro', 'pix', 'cartao', 'outro')),
  -- De quem é (dízimo com nome). Pode ser alguém de fora do rol, ou ninguém
  -- (envelope sem nome).
  membro_id uuid references public.rol_membros (id) on delete set null,
  nome text check (nome is null or char_length(nome) between 2 and 120),
  observacao text check (observacao is null or char_length(observacao) <= 300),
  criado_por uuid references auth.users (id) on delete set null,
  atualizado_por uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tesouraria_lancamentos_igreja_data_idx
  on public.tesouraria_lancamentos (church_id, data desc)
  where deleted_at is null;
create index tesouraria_lancamentos_company_idx on public.tesouraria_lancamentos (company_id);

alter table public.tesouraria_lancamentos enable row level security;

-- Tabela nova nasce com ALL para anon/authenticated: tira tudo e devolve só a
-- leitura. Gravar é só pelas funções abaixo.
revoke all on public.tesouraria_lancamentos from public, anon, authenticated;
grant select on public.tesouraria_lancamentos to authenticated;

create policy "tesouraria_lancamentos_select" on public.tesouraria_lancamentos
  for select to authenticated
  using (deleted_at is null and public.tem_acesso(company_id, 'tesouraria'));

-- ---------------------------------------------------------------------------
-- 3. Gravar (novo ou edição) e excluir
-- ---------------------------------------------------------------------------
-- Campos em JSON; texto vazio = sem valor. Limites e listas são os CHECKs da
-- tabela (valor fora deles falha com 23514).
create or replace function public.tesouraria_salvar(p_id uuid, p_church_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_atual public.tesouraria_lancamentos%rowtype;
  v_schedule uuid := nullif(p ->> 'schedule_id', '')::uuid;
  v_membro uuid := nullif(p ->> 'membro_id', '')::uuid;
  v_nome text := nullif(btrim(coalesce(p ->> 'nome', '')), '');
  v_titulo text;
  v_id uuid;
begin
  select company_id into v_company from public.churches where id = p_church_id and deleted_at is null;
  -- Mesma resposta para "não existe" e "não é sua".
  if v_company is null or not public.tem_acesso(v_company, 'tesouraria') then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;

  -- Culto e membro têm de ser DESTA igreja: id de outra não entra.
  if v_schedule is not null then
    select titulo into v_titulo from public.church_schedule where id = v_schedule and church_id = p_church_id;
    if v_titulo is null then
      raise exception 'culto não encontrado' using errcode = 'P0002';
    end if;
  end if;
  if v_membro is not null then
    select coalesce(v_nome, m.nome) into v_nome
    from public.rol_membros m
    where m.id = v_membro and m.church_id = p_church_id and m.deleted_at is null;
    if not found then
      raise exception 'membro não encontrado' using errcode = 'P0002';
    end if;
  end if;

  if p_id is null then
    insert into public.tesouraria_lancamentos
      (church_id, company_id, data, schedule_id, culto_titulo, tipo, valor_centavos, forma, membro_id, nome,
       observacao, criado_por)
    values
      (p_church_id, v_company, (p ->> 'data')::date, v_schedule, v_titulo, p ->> 'tipo',
       (p ->> 'valor_centavos')::integer, coalesce(nullif(p ->> 'forma', ''), 'dinheiro'), v_membro, v_nome,
       nullif(btrim(coalesce(p ->> 'observacao', '')), ''), auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  select * into v_atual from public.tesouraria_lancamentos
   where id = p_id and church_id = p_church_id and deleted_at is null
   for update;
  if v_atual.id is null then
    raise exception 'lançamento não encontrado' using errcode = 'P0002';
  end if;

  update public.tesouraria_lancamentos
     set data = (p ->> 'data')::date,
         schedule_id = v_schedule,
         culto_titulo = v_titulo,
         tipo = p ->> 'tipo',
         valor_centavos = (p ->> 'valor_centavos')::integer,
         forma = coalesce(nullif(p ->> 'forma', ''), 'dinheiro'),
         membro_id = v_membro,
         nome = v_nome,
         observacao = nullif(btrim(coalesce(p ->> 'observacao', '')), ''),
         atualizado_por = auth.uid(),
         updated_at = now()
   where id = p_id;

  -- Valor de dinheiro alterado depois de lançado fica registrado (sem o nome de quem deu).
  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_company, auth.uid(), 'tesouraria.lancamento_alterado', 'tesouraria_lancamento', p_id,
    jsonb_build_object(
      'tipo', v_atual.tipo, 'data_anterior', v_atual.data, 'valor_anterior', v_atual.valor_centavos,
      'valor_novo', (p ->> 'valor_centavos')::integer
    )
  );
  return p_id;
end;
$$;

create or replace function public.tesouraria_excluir(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual public.tesouraria_lancamentos%rowtype;
begin
  select * into v_atual from public.tesouraria_lancamentos where id = p_id and deleted_at is null for update;
  if v_atual.id is null or not public.tem_acesso(v_atual.company_id, 'tesouraria') then
    raise exception 'lançamento não encontrado' using errcode = 'P0002';
  end if;

  update public.tesouraria_lancamentos
     set deleted_at = now(), atualizado_por = auth.uid(), updated_at = now()
   where id = p_id;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_atual.company_id, auth.uid(), 'tesouraria.lancamento_excluido', 'tesouraria_lancamento', p_id,
    jsonb_build_object('tipo', v_atual.tipo, 'data', v_atual.data, 'valor', v_atual.valor_centavos)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Achar a pessoa pelo nome (o tesoureiro pode não ter o módulo Membros)
-- ---------------------------------------------------------------------------
-- Devolve só id e nome, e só para quem tem a tesouraria desta igreja.
create or replace function public.tesouraria_buscar_pessoas(p_church_id uuid, p_termo text)
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.nome
  from public.rol_membros m
  join public.churches c on c.id = m.church_id
  where m.church_id = p_church_id
    and m.deleted_at is null
    and c.deleted_at is null
    and public.tem_acesso(c.company_id, 'tesouraria')
    and char_length(btrim(coalesce(p_termo, ''))) >= 2
    and m.nome ilike '%' || replace(replace(replace(btrim(p_termo), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by m.nome
  limit 20;
$$;

revoke all on function public.tesouraria_salvar(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.tesouraria_excluir(uuid) from public, anon, authenticated;
revoke all on function public.tesouraria_buscar_pessoas(uuid, text) from public, anon, authenticated;
grant execute on function public.tesouraria_salvar(uuid, uuid, jsonb) to authenticated;
grant execute on function public.tesouraria_excluir(uuid) to authenticated;
grant execute on function public.tesouraria_buscar_pessoas(uuid, text) to authenticated;

notify pgrst, 'reload schema';
