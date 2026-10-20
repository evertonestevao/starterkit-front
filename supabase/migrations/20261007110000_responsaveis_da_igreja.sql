-- Responsáveis da igreja: pode haver mais de um, e só um Responsável faz outro.
--
-- "Responsável" é o papel `owner` em `company_members`: quem responde pela
-- igreja no sistema (na prática, o pastor). É ele quem confirma a chave Pix.
--
-- Antes:
--   * não havia como promover alguém a Responsável (só quem criou a conta);
--   * e, pior, a policy de UPDATE de `company_members` só exige ser
--     owner/admin: um ADMINISTRADOR conseguia, pela API, gravar `role = 'owner'`
--     na própria linha, ou remover o Responsável. O service recusava, o banco não.
--
-- Agora:
--   1. Pela API ninguém escreve o papel de Responsável direto na tabela — nem
--     cria, nem promove, nem rebaixa, nem remove. Só as funções abaixo.
--   2. `definir_responsavel`: um Responsável promove outro membro com acesso, ou
--     tira o papel de um Responsável (inclusive o próprio), desde que sobre um.
--   3. Convite nunca nasce como Responsável: a pessoa entra e depois é promovida.
--   4. Quem virou Responsável há menos de 24h ainda não recebe o link que
--     confirma a chave Pix, se houver um Responsável mais antigo. Sem isso, uma
--     sessão roubada promoveria um comparsa e confirmaria a chave na hora.

alter table public.company_members
  add column if not exists responsavel_desde timestamptz;

update public.company_members
   set responsavel_desde = created_at
 where role = 'owner' and responsavel_desde is null;

-- ---------------------------------------------------------------------------
-- 1. A tabela não aceita mexer em Responsável direto pela API
-- ---------------------------------------------------------------------------
-- `current_user` é o papel que está de fato executando: 'authenticated' numa
-- chamada direta da API; o dono da função dentro de uma SECURITY DEFINER.
create or replace function public.company_members_protege_responsavel()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.role = 'owner' then
        raise exception 'o papel de Responsável não é gravado direto' using errcode = '42501';
      end if;
    elsif old.role = 'owner' or new.role = 'owner' then
      raise exception 'o papel de Responsável não é alterado direto' using errcode = '42501';
    end if;
  end if;

  -- A data acompanha o papel, venha a escrita de onde vier.
  if new.role = 'owner' then
    if tg_op = 'INSERT' or old.role is distinct from 'owner' then
      new.responsavel_desde := coalesce(new.responsavel_desde, now());
    end if;
  else
    new.responsavel_desde := null;
  end if;
  return new;
end;
$$;

drop trigger if exists company_members_protege_responsavel on public.company_members;
create trigger company_members_protege_responsavel
  before insert or update on public.company_members
  for each row
  execute function public.company_members_protege_responsavel();

-- Convite não carrega o papel de Responsável.
alter table public.company_invites
  drop constraint if exists company_invites_sem_responsavel;
alter table public.company_invites
  add constraint company_invites_sem_responsavel check (role <> 'owner');

-- ---------------------------------------------------------------------------
-- 2. Promover / tirar o papel de Responsável
-- ---------------------------------------------------------------------------
-- Devolve os e-mails de quem precisa saber: todos os Responsáveis (antes e
-- depois da mudança) e a pessoa afetada.
create or replace function public.definir_responsavel(p_member_id uuid, p_responsavel boolean)
returns table (email text, afetado boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alvo public.company_members%rowtype;
  v_tornar boolean := coalesce(p_responsavel, false);
  v_outros integer;
begin
  select * into v_alvo from public.company_members where id = p_member_id and deleted_at is null;
  -- Mesma resposta para "não existe" e "não é da sua igreja".
  if v_alvo.id is null or not public.is_company_owner(v_alvo.company_id) then
    raise exception 'membro não encontrado' using errcode = 'P0002';
  end if;

  -- Trava os Responsáveis da conta: duas saídas ao mesmo tempo não deixam a igreja sem nenhum.
  perform 1 from public.company_members
   where company_id = v_alvo.company_id and role = 'owner' and deleted_at is null
   for update;

  if v_tornar then
    if v_alvo.role = 'owner' then
      raise exception 'esta pessoa já é Responsável' using errcode = '22023';
    end if;
    update public.company_members set role = 'owner' where id = v_alvo.id;
  else
    if v_alvo.role <> 'owner' then
      raise exception 'esta pessoa não é Responsável' using errcode = '22023';
    end if;
    select count(*) into v_outros from public.company_members
     where company_id = v_alvo.company_id and role = 'owner' and deleted_at is null and id <> v_alvo.id;
    if v_outros = 0 then
      raise exception 'a igreja precisa de pelo menos um Responsável' using errcode = '23514';
    end if;
    update public.company_members set role = 'admin' where id = v_alvo.id;
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_alvo.company_id, auth.uid(),
    case when v_tornar then 'member.responsavel_definido' else 'member.responsavel_removido' end,
    'company_member', v_alvo.id,
    jsonb_build_object('user_id', v_alvo.user_id, 'papel_anterior', v_alvo.role)
  );

  return query
  select u.email::text, cm.id = v_alvo.id
  from public.company_members cm
  join auth.users u on u.id = cm.user_id
  where cm.company_id = v_alvo.company_id
    and cm.deleted_at is null
    and (cm.role = 'owner' or cm.id = v_alvo.id)
    and u.email is not null;
end;
$$;

revoke all on function public.definir_responsavel(uuid, boolean) from public, anon, authenticated;
grant execute on function public.definir_responsavel(uuid, boolean) to authenticated;

-- Sair da igreja: o Responsável primeiro passa o papel adiante. (O service já
-- recusava; a função, chamada direto, deixava a igreja sem ninguém.)
create or replace function public.leave_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_company_owner(p_company_id) then
    raise exception 'o Responsável não sai sem passar o papel adiante' using errcode = '42501';
  end if;
  update public.company_members
  set deleted_at = now()
  where company_id = p_company_id
    and user_id = auth.uid()
    and deleted_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. O link do Pix vai para Responsável com mais de 24h no papel
-- ---------------------------------------------------------------------------
create or replace function public.pix_criar_confirmacao(
  p_church_id uuid,
  p_token_hash text,
  p_solicitado_por uuid,
  p_validade_horas integer default 48
)
returns table (email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_igreja public.churches%rowtype;
  v_ha_antigo boolean;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token inválido' using errcode = '22023';
  end if;

  select * into v_igreja from public.churches where id = p_church_id and deleted_at is null for update;
  if v_igreja.id is null or v_igreja.company_id is null or v_igreja.pix_chave is null
     or v_igreja.pix_aprovado_em is not null or v_igreja.pix_recusado_em is not null then
    raise exception 'não há chave aguardando confirmação' using errcode = 'P0002';
  end if;

  -- Um link válido por vez: o anterior deixa de funcionar.
  update public.church_pix_confirmacoes
     set deleted_at = now()
   where church_id = p_church_id and usado_em is null and deleted_at is null;

  insert into public.church_pix_confirmacoes
    (church_id, company_id, token_hash, pix_chave, pix_titular, solicitado_por, expires_at)
  values
    (p_church_id, v_igreja.company_id, p_token_hash, v_igreja.pix_chave, v_igreja.pix_titular, p_solicitado_por,
     now() + make_interval(hours => least(greatest(coalesce(p_validade_horas, 48), 1), 168)));

  -- Quem confirma é Responsável (owner) há mais de 24h. Igreja recém-criada,
  -- em que ninguém tem esse tempo, vale quem for Responsável.
  select exists (
    select 1 from public.company_members cm
    where cm.company_id = v_igreja.company_id and cm.deleted_at is null and cm.role = 'owner'
      and cm.responsavel_desde <= now() - interval '24 hours'
  ) into v_ha_antigo;

  return query
  select u.email::text
  from public.company_members cm
  join auth.users u on u.id = cm.user_id
  where cm.company_id = v_igreja.company_id
    and cm.deleted_at is null
    and cm.role = 'owner'
    and (not v_ha_antigo or cm.responsavel_desde <= now() - interval '24 hours')
    and u.email is not null;
end;
$$;

revoke all on function public.pix_criar_confirmacao(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.pix_criar_confirmacao(uuid, text, uuid, integer) to service_role;

notify pgrst, 'reload schema';
