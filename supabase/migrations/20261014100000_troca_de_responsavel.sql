-- Troca do Responsável (pastor) de uma igreja pela igreja de CIMA.
--
-- Um pastor pode ser trocado de igreja: quem controla isso é a igreja acima
-- dela na rede. Continuação da fase 2 (20261013100000), com o mesmo convite.
--
-- Regras (segurança):
--   * Só o RESPONSÁVEL (owner) de uma igreja ACIMA troca ou remove o
--     Responsável de uma de baixo. Não basta a permissão "Cadastrar igrejas
--     na rede": com ela, um secretário da sede se colocaria como dono de uma
--     congregação. (Igreja ainda aguardando responsável continua com a regra
--     da fase 2: quem tem a permissão convida.)
--   * Trocar = convidar a pessoa nova. Com "substituir", quando ela assume,
--     os Responsáveis anteriores perdem o acesso na hora. O cadastro de membro
--     deles na igreja fica (histórico) — só o acesso sai.
--   * Remover já = tirar o acesso agora (o pastor saiu). Se não sobra nenhum
--     Responsável, a igreja volta a "aguardando responsável": ninguém fica
--     dono por acaso, e a cobrança pausa até alguém assumir.
--   * A igreja de cima NUNCA troca a senha de ninguém (entraria na conta do
--     pastor, que pode ter outras igrejas): "esqueceu a senha" é o e-mail
--     oficial de recuperação, mandado para o e-mail dele.
--   * Tudo vai para a auditoria das duas igrejas.

alter table public.church_responsavel_convites
  add column if not exists substituir boolean not null default false;

-- Quem chama é Responsável de uma igreja ACIMA de p_church_id (não ela mesma).
create or replace function public.eh_responsavel_acima(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.churches abaixo
    join public.churches acima
      on abaixo.path <@ acima.path and acima.id <> abaixo.id and acima.deleted_at is null
    where abaixo.id = p_church_id
      and abaixo.deleted_at is null
      and acima.company_id is not null
      and public.is_company_owner(acima.company_id)
  );
$$;

revoke all on function public.eh_responsavel_acima(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Convidar: igreja aguardando (fase 2) OU troca numa igreja com dono
-- ---------------------------------------------------------------------------
drop function if exists public.convidar_responsavel(uuid, text, text, text, text, text, integer);
create function public.convidar_responsavel(
  p_church_id uuid,
  p_token_hash text,
  p_email text,
  p_nome text,
  p_cargo text,
  p_whatsapp text,
  p_validade_horas integer default 168,
  p_substituir boolean default false
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_igreja public.churches%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_validade timestamptz := now() + make_interval(hours => least(greatest(coalesce(p_validade_horas, 168), 1), 720));
  v_pode boolean;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token inválido' using errcode = '22023';
  end if;
  select * into v_igreja from public.churches where id = p_church_id and deleted_at is null for update;
  if v_igreja.id is null then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;

  -- Aguardando: quem tem a permissão de cadastrar na igreja de cima.
  -- Com dono: só o Responsável de uma igreja de cima (troca de pastor).
  v_pode := case when v_igreja.aguardando_responsavel then public.pode_gerir_igreja_abaixo(p_church_id)
                 else public.eh_responsavel_acima(p_church_id) end;
  if not v_pode then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;

  update public.church_responsavel_convites set deleted_at = now()
  where church_id = p_church_id and usado_em is null and deleted_at is null;

  insert into public.church_responsavel_convites
    (church_id, company_id, token_hash, email, nome, cargo_slug, whatsapp, expires_at, criado_por, substituir)
  values
    (p_church_id, v_igreja.company_id, p_token_hash, v_email, btrim(coalesce(p_nome, '')), nullif(p_cargo, ''),
     nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), ''), v_validade, auth.uid(),
     -- Substituir só faz sentido onde já há dono.
     coalesce(p_substituir, false) and not v_igreja.aguardando_responsavel);

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  select acima.company_id, auth.uid(),
         case when v_igreja.aguardando_responsavel then 'church.responsavel_convidado' else 'church.troca_de_responsavel_iniciada' end,
         'church', p_church_id,
         jsonb_build_object('nome', btrim(coalesce(p_nome, '')), 'cargo', nullif(p_cargo, ''), 'substituir', coalesce(p_substituir, false))
  from public.churches acima where acima.id = v_igreja.parent_id;

  return v_validade;
end;
$$;

revoke all on function public.convidar_responsavel(uuid, text, text, text, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.convidar_responsavel(uuid, text, text, text, text, text, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. O que o link mostra: agora vale também para igreja com dono (troca)
-- ---------------------------------------------------------------------------
drop function if exists public.convite_responsavel_por_token(text);
create function public.convite_responsavel_por_token(p_token text)
returns table (estado text, church_name text, tipo text, mae_name text, email text, nome text, substituir boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when k.usado_em is not null then 'usado'
      when k.deleted_at is not null or c.deleted_at is not null then 'substituido'
      when k.expires_at <= now() then 'expirado'
      else 'valido'
    end,
    public.church_full_name(c.name, c.sobrenome), c.tipo, public.church_full_name(m.name, m.sobrenome),
    case when k.usado_em is null and k.deleted_at is null and k.expires_at > now() then k.email end,
    k.nome,
    k.substituir
  from public.church_responsavel_convites k
  join public.churches c on c.id = k.church_id
  left join public.churches m on m.id = c.parent_id
  where k.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

revoke all on function public.convite_responsavel_por_token(text) from public, anon, authenticated;
grant execute on function public.convite_responsavel_por_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Assumir: com "substituir", os Responsáveis anteriores saem na hora
-- ---------------------------------------------------------------------------
drop function if exists public.aceitar_responsavel(text);
create function public.aceitar_responsavel(p_token text)
returns table (company_id uuid, church_name text, removidos text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_convite public.church_responsavel_convites%rowtype;
  v_igreja public.churches%rowtype;
  v_email text;
  v_cargo uuid;
  v_unico boolean;
  v_membro uuid;
  v_removidos text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'entre na sua conta para assumir' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();

  select * into v_convite from public.church_responsavel_convites
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;
  if v_convite.id is not null then
    select * into v_igreja from public.churches where id = v_convite.church_id and deleted_at is null for update;
  end if;

  if v_convite.id is null or v_igreja.id is null or v_convite.usado_em is not null or v_convite.deleted_at is not null
     or v_convite.expires_at <= now() then
    raise exception 'este convite não vale mais' using errcode = 'P0002';
  end if;
  if v_email is distinct from v_convite.email then
    raise exception 'este convite é para outro e-mail' using errcode = '42501';
  end if;

  -- Trava os Responsáveis da conta enquanto mexe neles.
  perform 1 from public.company_members cm
   where cm.company_id = v_igreja.company_id and cm.role = 'owner' and cm.deleted_at is null
   for update;

  update public.company_members set role = 'owner', deleted_at = null
  where company_members.company_id = v_igreja.company_id and user_id = auth.uid();
  if not found then
    insert into public.company_members (company_id, user_id, role) values (v_igreja.company_id, auth.uid(), 'owner');
  end if;

  -- Troca: os Responsáveis anteriores perdem o acesso (o cadastro de membro fica).
  if v_convite.substituir then
    select coalesce(array_agg(u.email::text), '{}') into v_removidos
    from public.company_members cm
    join auth.users u on u.id = cm.user_id
    where cm.company_id = v_igreja.company_id and cm.role = 'owner' and cm.deleted_at is null
      and cm.user_id <> auth.uid();
    update public.company_members set deleted_at = now()
    where company_members.company_id = v_igreja.company_id and role = 'owner' and deleted_at is null
      and user_id <> auth.uid();
  end if;

  update public.churches set
    assumida_em = case when aguardando_responsavel then now() else assumida_em end,
    aguardando_responsavel = false
  where id = v_igreja.id;
  update public.church_responsavel_convites set usado_em = now(), usado_por = auth.uid() where id = v_convite.id;

  if v_convite.cargo_slug is not null then
    select id, unico into v_cargo, v_unico from public.cargos where church_id is null and slug = v_convite.cargo_slug;
    select id into v_membro from public.rol_membros
    where church_id = v_igreja.id and user_id = auth.uid() and deleted_at is null;
    if v_cargo is not null and v_membro is not null then
      -- Cargo de uma pessoa só (Pastor): na troca, sai de quem saiu; sem
      -- troca, quem continua fica com ele e o novo não recebe.
      if v_unico and v_convite.substituir then
        delete from public.rol_membro_cargos
        where church_id = v_igreja.id and cargo_id = v_cargo and membro_id <> v_membro;
      end if;
      if not v_unico or not exists (
        select 1 from public.rol_membro_cargos where church_id = v_igreja.id and cargo_id = v_cargo and membro_id <> v_membro
      ) then
        insert into public.rol_membro_cargos (membro_id, cargo_id, church_id)
        values (v_membro, v_cargo, v_igreja.id)
        on conflict do nothing;
      end if;
    end if;
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_igreja.company_id, auth.uid(), 'church.responsavel_assumiu', 'church', v_igreja.id,
          jsonb_build_object('convite', v_convite.id, 'cargo', v_convite.cargo_slug,
                             'substituiu', coalesce(array_length(v_removidos, 1), 0)));
  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  select acima.company_id, auth.uid(), 'church.responsavel_assumiu_abaixo', 'church', v_igreja.id,
         jsonb_build_object('igreja', v_igreja.name, 'substituiu', coalesce(array_length(v_removidos, 1), 0))
  from public.churches acima where acima.id = v_igreja.parent_id;

  return query select v_igreja.company_id, public.church_full_name(v_igreja.name, v_igreja.sobrenome), v_removidos;
end;
$$;

revoke all on function public.aceitar_responsavel(text) from public, anon, authenticated;
grant execute on function public.aceitar_responsavel(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Remover já (o pastor saiu)
-- ---------------------------------------------------------------------------
-- Devolve o e-mail de quem saiu (para o aviso) e se a igreja ficou sem ninguém.
create or replace function public.remover_responsavel_abaixo(p_member_id uuid)
returns table (email text, ficou_sem_responsavel boolean, church_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alvo public.company_members%rowtype;
  v_igreja public.churches%rowtype;
  v_email text;
  v_restam integer;
begin
  select * into v_alvo from public.company_members where id = p_member_id and deleted_at is null;
  if v_alvo.id is not null then
    select * into v_igreja from public.churches
    where churches.company_id = v_alvo.company_id and deleted_at is null
    order by nlevel(path), created_at, id limit 1;
  end if;
  -- Mesma resposta para "não existe", "não é Responsável" e "não é de baixo".
  if v_alvo.id is null or v_alvo.role <> 'owner' or v_igreja.id is null or not public.eh_responsavel_acima(v_igreja.id) then
    raise exception 'responsável não encontrado' using errcode = 'P0002';
  end if;

  perform 1 from public.company_members cm
   where cm.company_id = v_alvo.company_id and cm.role = 'owner' and cm.deleted_at is null
   for update;

  select u.email::text into v_email from auth.users u where u.id = v_alvo.user_id;
  update public.company_members set deleted_at = now() where id = v_alvo.id;

  select count(*) into v_restam from public.company_members cm
  where cm.company_id = v_alvo.company_id and cm.role = 'owner' and cm.deleted_at is null;
  if v_restam = 0 then
    update public.churches set aguardando_responsavel = true where id = v_igreja.id;
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_alvo.company_id, auth.uid(), 'member.responsavel_removido_pela_rede', 'company_member', v_alvo.id,
          jsonb_build_object('user_id', v_alvo.user_id, 'ficou_sem_responsavel', v_restam = 0));
  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  select acima.company_id, auth.uid(), 'church.responsavel_removido_abaixo', 'church', v_igreja.id,
         jsonb_build_object('igreja', v_igreja.name, 'ficou_sem_responsavel', v_restam = 0)
  from public.churches acima where acima.id = v_igreja.parent_id;

  return query select v_email, v_restam = 0, public.church_full_name(v_igreja.name, v_igreja.sobrenome);
end;
$$;

revoke all on function public.remover_responsavel_abaixo(uuid) from public, anon, authenticated;
grant execute on function public.remover_responsavel_abaixo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Quem responde por cada igreja abaixo (para o Responsável de cima)
-- ---------------------------------------------------------------------------
-- Só nome, e-mail e desde quando: nada dos dados da igreja.
create or replace function public.responsaveis_da_rede(p_church_id uuid)
returns table (
  church_id uuid, church_name text, tipo text, member_id uuid, nome text, email text, desde timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, public.church_full_name(c.name, c.sobrenome), c.tipo, cm.id,
         coalesce(nullif(trim(p.full_name), ''), u.email::text), u.email::text, cm.responsavel_desde
  from public.churches eu
  join public.churches c on c.path <@ eu.path and c.id <> eu.id and c.deleted_at is null
  join public.company_members cm on cm.company_id = c.company_id and cm.role = 'owner' and cm.deleted_at is null
  join auth.users u on u.id = cm.user_id
  left join public.profiles p on p.id = cm.user_id
  where eu.id = p_church_id
    and eu.deleted_at is null
    and eu.company_id is not null
    and public.is_company_owner(eu.company_id)
  order by nlevel(c.path), c.name, cm.responsavel_desde;
$$;

revoke all on function public.responsaveis_da_rede(uuid) from public, anon, authenticated;
grant execute on function public.responsaveis_da_rede(uuid) to authenticated;

-- E-mails dos Responsáveis da igreja de cima (para os avisos da troca). Só o servidor.
create or replace function public.emails_responsaveis_acima(p_church_id uuid)
returns table (email text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct u.email::text
  from public.churches c
  join public.churches acima on acima.id = c.parent_id and acima.deleted_at is null
  join public.company_members cm on cm.company_id = acima.company_id and cm.role = 'owner' and cm.deleted_at is null
  join auth.users u on u.id = cm.user_id
  where c.id = p_church_id and u.email is not null;
$$;

revoke all on function public.emails_responsaveis_acima(uuid) from public, anon, authenticated;
grant execute on function public.emails_responsaveis_acima(uuid) to service_role;

notify pgrst, 'reload schema';
