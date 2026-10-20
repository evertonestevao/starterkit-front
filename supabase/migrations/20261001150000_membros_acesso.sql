-- ---------------------------------------------------------------------------
-- Membros = pessoas da igreja; acesso ao sistema é um detalhe do membro
-- ---------------------------------------------------------------------------
-- Antes havia três cadastros de gente: "Pessoas" (company_members, quem tem
-- login), "Membros" (rol_membros, a chamada) e "Liderança" (church_leaders).
-- Agora o MEMBRO é a pessoa:
--
--   * rol_membros ganha e-mail, o vínculo com a conta (user_id) e
--     `participa_chamada` (login que só administra não entra na chamada);
--   * todo login vira membro: trigger em company_members e em churches
--     (a igreja nasce depois do owner em create_company_with_church). O
--     aceite de convite liga o membro pelo e-mail;
--   * a Liderança vira membro + cargo (rol_membro_cargos). church_leaders
--     fica só como histórico, sem tela;
--   * o nome do Pastor das igrejas de baixo, que a de cima via pela
--     Liderança, vem de `pastores_das_igrejas` (só nome, só pela árvore).
--
-- PERMISSÃO NÃO MUDA: quem pode o quê continua sendo o papel em
-- company_members (owner/admin/member). Membro sem login segue sem acesso.

-- ---------------------------------------------------------------------------
-- 1. Colunas novas do membro
-- ---------------------------------------------------------------------------
alter table public.rol_membros
  add column if not exists email text
    check (email is null or (char_length(email) between 5 and 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+$')),
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists participa_chamada boolean not null default true,
  -- Quando o convite ao sistema foi enviado a partir do membro.
  add column if not exists convidado_em timestamptz;

comment on column public.rol_membros.user_id is
  'Conta de login ligada a este membro (preenchida pelo sistema; ver garante_membro_do_login).';
comment on column public.rol_membros.participa_chamada is
  'Aparece na chamada e nos alertas. Desligado para quem só administra (ex.: contador).';

-- Um membro por conta em cada igreja; e-mail não se repete na igreja.
create unique index if not exists rol_membros_user_idx
  on public.rol_membros (church_id, user_id)
  where user_id is not null and deleted_at is null;
create unique index if not exists rol_membros_email_idx
  on public.rol_membros (church_id, lower(email))
  where email is not null and deleted_at is null;

-- user_id e convidado_em são do sistema: fora dos GRANTs (ninguém liga o
-- membro à conta de outra pessoa).
grant insert (email, participa_chamada) on public.rol_membros to authenticated;
grant update (email, participa_chamada) on public.rol_membros to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Todo login é membro
-- ---------------------------------------------------------------------------
create or replace function public.garante_membro_do_login(p_company uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church uuid;
  v_email text;
  v_nome text;
begin
  select id into v_church from public.churches
  where company_id = p_company and deleted_at is null
  order by created_at limit 1;
  if v_church is null then
    return; -- igreja ainda não existe; o trigger de churches cuida depois
  end if;

  if exists (
    select 1 from public.rol_membros
    where church_id = v_church and user_id = p_user and deleted_at is null
  ) then
    return;
  end if;

  select u.email, nullif(trim(p.full_name), '')
  into v_email, v_nome
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user;

  -- Membro já cadastrado com o e-mail (ex.: convidado pela tela de Membros).
  update public.rol_membros
  set user_id = p_user
  where church_id = v_church and deleted_at is null and user_id is null
    and lower(email) = lower(v_email);
  if found then
    return;
  end if;

  -- Login sem cadastro no rol: entra como membro, FORA da chamada (não
  -- tem histórico de presença; entraria em alerta por "faltas").
  insert into public.rol_membros (church_id, nome, email, user_id, participa_chamada)
  values (
    v_church,
    left(coalesce(v_nome, split_part(v_email, '@', 1), 'Membro'), 120),
    v_email,
    p_user,
    false
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.garante_membro_do_login(uuid, uuid) from public, anon, authenticated;

create or replace function public.garante_membro_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cm record;
begin
  if tg_table_name = 'company_members' then
    if new.deleted_at is null then
      perform public.garante_membro_do_login(new.company_id, new.user_id);
    end if;
  else -- churches: a igreja chegou depois dos logins da empresa
    if new.company_id is not null and new.deleted_at is null then
      for v_cm in
        select user_id from public.company_members
        where company_id = new.company_id and deleted_at is null
      loop
        perform public.garante_membro_do_login(new.company_id, v_cm.user_id);
      end loop;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.garante_membro_trigger() from public, anon, authenticated;

drop trigger if exists company_members_garante_membro on public.company_members;
create trigger company_members_garante_membro
  after insert or update of deleted_at on public.company_members
  for each row execute function public.garante_membro_trigger();

drop trigger if exists churches_garante_membro on public.churches;
create trigger churches_garante_membro
  after insert on public.churches
  for each row execute function public.garante_membro_trigger();

-- Quem já tem login hoje.
do $$
declare v record;
begin
  for v in select company_id, user_id from public.company_members where deleted_at is null loop
    perform public.garante_membro_do_login(v.company_id, v.user_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Liderança -> membro com cargo
-- ---------------------------------------------------------------------------
do $$
declare
  v_lider record;
  v_membro uuid;
begin
  for v_lider in
    select l.*, c.unico
    from public.church_leaders l
    join public.cargos c on c.id = l.cargo_id
    where l.deleted_at is null
    order by l.created_at
  loop
    v_membro := null;
    if v_lider.user_id is not null then
      select id into v_membro from public.rol_membros
      where church_id = v_lider.church_id and user_id = v_lider.user_id and deleted_at is null;
    end if;
    if v_membro is null and v_lider.email is not null then
      select id into v_membro from public.rol_membros
      where church_id = v_lider.church_id and lower(email) = lower(v_lider.email) and deleted_at is null;
    end if;
    if v_membro is null then
      insert into public.rol_membros (church_id, nome, email, whatsapp, user_id, participa_chamada, convidado_em)
      values (v_lider.church_id, v_lider.nome, lower(v_lider.email), v_lider.telefone, v_lider.user_id,
              false, v_lider.convidado_em)
      returning id into v_membro;
    end if;

    -- Cargo de uma pessoa só já ocupado no rol: mantém quem já estava.
    if v_lider.unico and exists (
      select 1 from public.rol_membro_cargos
      where church_id = v_lider.church_id and cargo_id = v_lider.cargo_id
    ) then
      continue;
    end if;

    insert into public.rol_membro_cargos (membro_id, cargo_id, church_id, desde)
    values (v_membro, v_lider.cargo_id, v_lider.church_id, v_lider.desde)
    on conflict do nothing;
  end loop;
end $$;

comment on table public.church_leaders is
  'HISTÓRICO. Substituída por rol_membros + rol_membro_cargos (migration 20261001150000). Sem tela.';

-- ---------------------------------------------------------------------------
-- 4. Pastor das igrejas de baixo (só o nome, só pela árvore)
-- ---------------------------------------------------------------------------
-- O rol é da própria igreja (LGPD). A exceção combinada desde a Liderança:
-- a igreja de cima vê o NOME do Pastor das de baixo, na lista de vínculos.
create or replace function public.pastores_das_igrejas(p_church_ids uuid[])
returns table (church_id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (rc.church_id) rc.church_id, m.nome
  from public.rol_membro_cargos rc
  join public.cargos c on c.id = rc.cargo_id and c.slug = 'pastor'
  join public.rol_membros m on m.id = rc.membro_id and m.deleted_at is null and m.ativo
  where rc.church_id = any (p_church_ids)
    and public.can_admin_view_church(rc.church_id)
  order by rc.church_id, rc.desde desc;
$$;

revoke all on function public.pastores_das_igrejas(uuid[]) from public, anon, authenticated;
grant execute on function public.pastores_das_igrejas(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Quem não participa da chamada não entra em alerta
-- ---------------------------------------------------------------------------
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
  join public.rol_membros m on m.id = s.membro_id and m.deleted_at is null and m.ativo and m.participa_chamada
  left join ultima_presenca u on u.membro_id = s.membro_id
  left join contato c on c.membro_id = s.membro_id
  cross join cfg
  where s.faltas >= cfg.faltas_alerta
    and (c.data is null or c.data < s.ultima_falta or c.resultado = 'em_acompanhamento')
  order by s.faltas desc, m.nome;
$$;

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
  join public.rol_membros m on m.id = j.membro_id and m.deleted_at is null and m.ativo and m.participa_chamada
  left join ultima_presenca u on u.membro_id = j.membro_id
  left join contato c on c.membro_id = j.membro_id
  cross join cfg
  where (j.cultos > cfg.justificativa_longa_cultos or current_date - j.desde > cfg.justificativa_longa_dias)
    and (c.data is null or c.data < j.desde or c.resultado = 'em_acompanhamento')
  order by j.desde, m.nome;
$$;

notify pgrst, 'reload schema';
