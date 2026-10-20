-- ---------------------------------------------------------------------------
-- Acessos por cargo: o Responsável libera módulos para cada cargo da igreja
-- ---------------------------------------------------------------------------
-- Quem tem login e um cargo no rol (Secretário, Diácono...) passa a usar os
-- módulos liberados para esse cargo, como um administrador usa — só naquele
-- módulo. Responsável e Administrador continuam com tudo.
--
-- A igreja de baixo HERDA da de cima (a mais próxima que definiu vence) e
-- pode trocar o que quiser. Só fica gravado o que difere do herdado.
--
-- Módulos liberáveis: acompanhamento, membros, ebd, programacao, events,
-- campaigns. Ficam FORA, sempre com Responsável/Administrador: assinatura,
-- Pix e cartão, esta configuração, logins/convites e pedidos de oração.
--
-- Aqui o acesso é DE VERDADE: as funções e policies de cada módulo passam a
-- consultar tem_acesso(). Sem cargo liberado, nada muda em relação a antes.

create table public.cargo_acessos (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  cargo_id uuid not null references public.cargos (id) on delete cascade,
  modulo text not null check (
    modulo in ('acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns')
  ),
  permitido boolean not null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (church_id, cargo_id, modulo)
);

create index cargo_acessos_company_idx on public.cargo_acessos (company_id);
create index cargo_acessos_cargo_idx on public.cargo_acessos (cargo_id, modulo);

create trigger set_cargo_acessos_company_id
  before insert or update of church_id on public.cargo_acessos
  for each row execute function public.set_company_id_from_church();

alter table public.cargo_acessos enable row level security;

-- Tabela nasce com ALL para anon/authenticated: tira tudo. Ninguém lê nem
-- escreve direto; tudo passa pelas funções abaixo.
revoke all on public.cargo_acessos from anon, authenticated;

-- Sem GRANT não há acesso; a policy fica para o dia em que houver leitura
-- direta: só o responsável pela própria igreja.
create policy "cargo_acessos_select_owner"
  on public.cargo_acessos for select
  to authenticated
  using (company_id is not null and public.is_company_owner(company_id));

-- ---------------------------------------------------------------------------
-- O coração: a pessoa tem o módulo liberado por algum cargo dela?
-- ---------------------------------------------------------------------------
-- Vale quando: (1) ela ainda tem login ativo na empresa; (2) o membro ligado
-- à conta dela, no rol da igreja da empresa, tem um cargo ativo; (3) para
-- esse cargo e módulo, a definição mais próxima (a própria igreja, depois a
-- mãe, a avó...) diz "permitido". Sem definição nenhuma = não.
create or replace function public.tem_acesso_por_cargo(p_company_id uuid, p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    join public.churches minha on minha.company_id = cm.company_id and minha.deleted_at is null
    join public.rol_membros m on m.church_id = minha.id and m.user_id = cm.user_id and m.deleted_at is null
    join public.rol_membro_cargos rc on rc.membro_id = m.id
    join public.cargos cg on cg.id = rc.cargo_id and cg.deleted_at is null
    cross join lateral (
      select ca.permitido
      from public.cargo_acessos ca
      join public.churches acima on acima.id = ca.church_id and acima.deleted_at is null
      where minha.path <@ acima.path
        and ca.cargo_id = cg.id
        and ca.modulo = p_modulo
        and ca.deleted_at is null
      order by nlevel(acima.path) desc
      limit 1
    ) vale
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
      and vale.permitido
  );
$$;

-- Administra a igreja OU tem o módulo liberado por cargo.
create or replace function public.tem_acesso(p_company_id uuid, p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_company_admin(p_company_id) or public.tem_acesso_por_cargo(p_company_id, p_modulo);
$$;

revoke all on function public.tem_acesso_por_cargo(uuid, text) from public, anon, authenticated;
revoke all on function public.tem_acesso(uuid, text) from public, anon, authenticated;
grant execute on function public.tem_acesso_por_cargo(uuid, text) to authenticated;
grant execute on function public.tem_acesso(uuid, text) to authenticated;

-- Módulos liberados por cargo para quem pergunta, em cada empresa dele
-- (o app monta o menu com isto).
create or replace function public.meus_acessos()
returns table (company_id uuid, modulo text)
language sql
stable
security definer
set search_path = public
as $$
  select cm.company_id, mod.modulo
  from public.company_members cm
  cross join unnest(array['acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns']) as mod(modulo)
  where cm.user_id = auth.uid()
    and cm.deleted_at is null
    and public.tem_acesso_por_cargo(cm.company_id, mod.modulo);
$$;

revoke all on function public.meus_acessos() from public, anon, authenticated;
grant execute on function public.meus_acessos() to authenticated;

-- ---------------------------------------------------------------------------
-- Configuração (só o Responsável)
-- ---------------------------------------------------------------------------
-- Linhas da própria igreja (nivel 0) e das acima (1 = mãe, 2 = avó...).
create or replace function public.cargo_acessos_da_rede(p_company_id uuid)
returns table (cargo_id uuid, modulo text, permitido boolean, nivel int, igreja text)
language sql
stable
security definer
set search_path = public
as $$
  select ca.cargo_id, ca.modulo, ca.permitido,
         nlevel(minha.path) - nlevel(acima.path) as nivel,
         acima.name as igreja
  from public.churches minha
  join public.churches acima on minha.path <@ acima.path and acima.deleted_at is null
  join public.cargo_acessos ca on ca.church_id = acima.id and ca.deleted_at is null
  where minha.company_id = p_company_id
    and minha.deleted_at is null
    and public.is_company_owner(p_company_id);
$$;

revoke all on function public.cargo_acessos_da_rede(uuid) from public, anon, authenticated;
grant execute on function public.cargo_acessos_da_rede(uuid) to authenticated;

-- Grava o conjunto de exceções da PRÓPRIA igreja (substitui o anterior).
-- Só o Responsável: um administrador não libera módulos por conta própria.
create or replace function public.salvar_cargo_acessos(p_company_id uuid, p_itens jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church uuid;
begin
  if not public.is_company_owner(p_company_id) then
    raise exception 'apenas o responsável altera os acessos' using errcode = '42501';
  end if;

  select id into v_church
  from public.churches
  where company_id = p_company_id and deleted_at is null
  order by created_at
  limit 1;
  if v_church is null then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) > 500 then
    raise exception 'lista de acessos inválida' using errcode = '22023';
  end if;

  -- Cargo de outra rede (ou desativado) não entra.
  if exists (
    select 1
    from jsonb_to_recordset(p_itens) as i(cargo_id uuid, modulo text, permitido boolean)
    where not public.cargo_disponivel_para(i.cargo_id, v_church)
  ) then
    raise exception 'cargo não disponível para esta igreja' using errcode = '22023';
  end if;

  delete from public.cargo_acessos where church_id = v_church;

  insert into public.cargo_acessos (church_id, cargo_id, modulo, permitido, updated_by)
  select v_church, i.cargo_id, i.modulo, i.permitido, auth.uid()
  from jsonb_to_recordset(p_itens) as i(cargo_id uuid, modulo text, permitido boolean)
  where i.cargo_id is not null and i.modulo is not null and i.permitido is not null;
end;
$$;

revoke all on function public.salvar_cargo_acessos(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_cargo_acessos(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Presença nos cultos e Membros: can_acompanhar aceita o cargo liberado
-- ---------------------------------------------------------------------------
-- As duas telas leem o mesmo rol, então qualquer um dos dois módulos abre a
-- função. (O menu de cada uma continua separado no app.)
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
      and (
        cm.role in ('owner', 'admin')
        or cm.pode_acompanhar
        or public.tem_acesso_por_cargo(c.company_id, 'acompanhamento')
        or public.tem_acesso_por_cargo(c.company_id, 'membros')
      )
  );
$$;

-- EBD: gestão da escola pelo cargo liberado.
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
      and (
        cm.role in ('owner', 'admin')
        or cm.pode_gerir_ebd
        or public.tem_acesso_por_cargo(c.company_id, 'ebd')
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Programação
-- ---------------------------------------------------------------------------
drop policy "church_schedule_insert_admin" on public.church_schedule;
create policy "church_schedule_insert_admin"
  on public.church_schedule for insert
  to authenticated
  with check (
    exists (
      select 1 from public.churches c
      where c.id = church_schedule.church_id
        and c.company_id is not null
        and public.tem_acesso(c.company_id, 'programacao')
    )
  );

drop policy "church_schedule_select_admin" on public.church_schedule;
create policy "church_schedule_select_admin"
  on public.church_schedule for select
  to authenticated
  using (company_id is not null and public.tem_acesso(company_id, 'programacao'));

drop policy "church_schedule_update_admin" on public.church_schedule;
create policy "church_schedule_update_admin"
  on public.church_schedule for update
  to authenticated
  using (company_id is not null and public.tem_acesso(company_id, 'programacao'))
  with check (company_id is not null and public.tem_acesso(company_id, 'programacao'));

-- ---------------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------------
drop policy "church_events_insert_admin" on public.church_events;
create policy "church_events_insert_admin"
  on public.church_events for insert
  to authenticated
  with check (
    exists (
      select 1 from public.churches c
      where c.id = church_events.church_id
        and c.company_id is not null
        and public.tem_acesso(c.company_id, 'events')
    )
  );

drop policy "church_events_select_admin" on public.church_events;
create policy "church_events_select_admin"
  on public.church_events for select
  to authenticated
  using (company_id is not null and public.tem_acesso(company_id, 'events'));

drop policy "church_events_update_admin" on public.church_events;
create policy "church_events_update_admin"
  on public.church_events for update
  to authenticated
  using (company_id is not null and public.tem_acesso(company_id, 'events'))
  with check (company_id is not null and public.tem_acesso(company_id, 'events'));

-- ---------------------------------------------------------------------------
-- Campanhas (o Pix da igreja NÃO entra: church_pix continua só com quem
-- administra; a campanha usa a chave já cadastrada)
-- ---------------------------------------------------------------------------
drop policy "campaigns_insert_admin" on public.campaigns;
create policy "campaigns_insert_admin"
  on public.campaigns for insert
  to authenticated
  with check (
    exists (
      select 1 from public.churches c
      where c.id = campaigns.church_id and public.tem_acesso(c.company_id, 'campaigns')
    )
  );

drop policy "campaigns_select_admin" on public.campaigns;
create policy "campaigns_select_admin"
  on public.campaigns for select
  to authenticated
  using (company_id is not null and public.tem_acesso(company_id, 'campaigns'));

drop policy "campaigns_update_admin" on public.campaigns;
create policy "campaigns_update_admin"
  on public.campaigns for update
  to authenticated
  using (company_id is not null and public.tem_acesso(company_id, 'campaigns'))
  with check (company_id is not null and public.tem_acesso(company_id, 'campaigns'));

drop policy "campaign_donations_select_admin" on public.campaign_donations;
create policy "campaign_donations_select_admin"
  on public.campaign_donations for select
  to authenticated
  using (company_id is not null and public.tem_acesso(company_id, 'campaigns'));

create or replace function public.can_manage_campaign_files(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id
      and c.deleted_at is null
      and c.company_id is not null
      and public.tem_acesso(c.company_id, 'campaigns')
  );
$$;

create or replace function public.confirmar_doacao_pix(p_donation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doacao public.campaign_donations%rowtype;
begin
  select * into v_doacao
  from public.campaign_donations
  where id = p_donation_id;

  if v_doacao.id is null then
    raise exception 'Doação não encontrada' using errcode = 'P0002';
  end if;
  if v_doacao.company_id is null or not public.tem_acesso(v_doacao.company_id, 'campaigns') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_doacao.metodo <> 'pix' then
    raise exception 'Esta doação não é PIX' using errcode = 'P0001';
  end if;

  -- Guarda de idempotência: um segundo clique (ou uma corrida entre duas
  -- abas) não confirma nem soma duas vezes.
  update public.campaign_donations
  set status = 'confirmada',
      valor_liquido_cents = valor_bruto_cents,
      confirmada_por = auth.uid(),
      confirmada_em = now()
  where id = p_donation_id and status = 'pendente';

  if found then
    update public.campaigns
    set total_arrecadado_liquido_cents = total_arrecadado_liquido_cents + v_doacao.valor_bruto_cents
    where id = v_doacao.campaign_id;
  end if;
end;
$$;

notify pgrst, 'reload schema';
