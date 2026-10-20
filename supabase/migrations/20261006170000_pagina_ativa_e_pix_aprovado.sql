-- Igreja nova não nasce no ar, e o Pix só aparece depois de aprovado.
--
-- Antes: criar uma conta já publicava uma página com nome, links e chave Pix,
-- sem ninguém olhar. Dava para montar uma página se passando por uma igreja
-- real e divulgar um Pix próprio.
--
-- Agora:
--   1. A página nasce FORA DO AR (`pagina_ativa = false`). Quem administra a
--      igreja liga quando quiser, nos primeiros passos. Sem aprovação: uma
--      página sem Pix não desvia dinheiro de ninguém.
--   2. A chave Pix própria só vai para o público depois que a MODERAÇÃO da
--      plataforma aprova. Trocar a chave volta para "aguardando": chave nova
--      (de dono legítimo ou de conta invadida) nunca é publicada sozinha.
--      Pix e cartão pela subconta do provedor não passam por aqui — lá a
--      identidade da igreja já é conferida pelo provedor.
--
-- O anon deixa de ler `pix_chave`/`pix_titular` direto na tabela: GRANT por
-- coluna não tem "só se aprovado", então a chave pública sai por uma função.

-- ---------------------------------------------------------------------------
-- 1. Página no ar
-- ---------------------------------------------------------------------------
alter table public.churches
  add column if not exists pagina_ativa boolean not null default false,
  add column if not exists pagina_ativada_em timestamptz;

-- As que já existem continuam no ar (nada some para quem já usa).
update public.churches set pagina_ativa = true, pagina_ativada_em = coalesce(pagina_ativada_em, created_at);

-- Sem GRANT de UPDATE na coluna: liga e desliga só pela função abaixo.
grant select (pagina_ativa) on public.churches to anon;

create or replace function public.definir_pagina_ativa(p_church_id uuid, p_ativa boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.churches where id = p_church_id and deleted_at is null;
  -- Mesma resposta para "não existe" e "não é sua".
  if v_company is null or not public.is_company_admin(v_company) then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;
  update public.churches
     set pagina_ativa = coalesce(p_ativa, false),
         pagina_ativada_em = case when coalesce(p_ativa, false) then now() else pagina_ativada_em end
   where id = p_church_id and pagina_ativa is distinct from coalesce(p_ativa, false);
end;
$$;

revoke all on function public.definir_pagina_ativa(uuid, boolean) from public, anon, authenticated;
grant execute on function public.definir_pagina_ativa(uuid, boolean) to authenticated;

-- Quem administra a igreja vê a própria página antes de publicar (prévia).
create or replace function public.posso_ver_previa_da_pagina(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.churches c
    where c.id = p_church_id and c.deleted_at is null
      and c.company_id is not null and public.is_company_admin(c.company_id)
  );
$$;

revoke all on function public.posso_ver_previa_da_pagina(uuid) from public, anon, authenticated;
grant execute on function public.posso_ver_previa_da_pagina(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Pix: estado da aprovação
-- ---------------------------------------------------------------------------
alter table public.churches
  add column if not exists pix_enviado_em timestamptz,
  add column if not exists pix_aprovado_em timestamptz,
  add column if not exists pix_aprovado_por uuid references auth.users (id) on delete set null,
  add column if not exists pix_recusado_em timestamptz,
  add column if not exists pix_recusa_motivo text check (pix_recusa_motivo is null or char_length(pix_recusa_motivo) <= 300);

-- Chaves que já estavam publicadas continuam valendo.
update public.churches
   set pix_enviado_em = coalesce(pix_enviado_em, updated_at), pix_aprovado_em = coalesce(pix_aprovado_em, now())
 where pix_chave is not null;

-- Chave ou titular mudou: volta para "aguardando aprovação".
create or replace function public.churches_pix_volta_para_analise()
returns trigger
language plpgsql
as $$
begin
  if new.pix_chave is distinct from old.pix_chave or new.pix_titular is distinct from old.pix_titular then
    new.pix_aprovado_em := null;
    new.pix_aprovado_por := null;
    new.pix_recusado_em := null;
    new.pix_recusa_motivo := null;
    new.pix_enviado_em := case when new.pix_chave is null then null else now() end;
  end if;
  return new;
end;
$$;

create trigger churches_pix_volta_para_analise
  before update of pix_chave, pix_titular on public.churches
  for each row
  execute function public.churches_pix_volta_para_analise();

-- A chave que o PÚBLICO pode ver: página no ar, Pix próprio e aprovado.
revoke select (pix_chave, pix_titular) on public.churches from anon;

create or replace function public.pix_publico(p_church_id uuid)
returns table (chave text, titular text)
language sql
stable
security definer
set search_path = public
as $$
  select c.pix_chave, c.pix_titular
  from public.churches c
  where c.id = p_church_id and c.deleted_at is null
    and c.pagina_ativa
    and c.pix_fonte = 'propria'
    and c.pix_chave is not null
    and c.pix_aprovado_em is not null;
$$;

revoke all on function public.pix_publico(uuid) from public, anon, authenticated;
grant execute on function public.pix_publico(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Moderação: fila e decisão
-- ---------------------------------------------------------------------------
create or replace function public.platform_list_pix_pendentes()
returns table (
  church_id uuid,
  church_name text,
  public_code text,
  address text,
  pagina_ativa boolean,
  pix_chave text,
  pix_titular text,
  pix_enviado_em timestamptz,
  igreja_criada_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.public_code, c.address, c.pagina_ativa, c.pix_chave, c.pix_titular, c.pix_enviado_em, c.created_at
  from public.churches c
  where public.is_platform_staff()
    and c.deleted_at is null
    and c.pix_chave is not null
    and c.pix_aprovado_em is null
    and c.pix_recusado_em is null
  order by c.pix_enviado_em nulls first;
$$;

create or replace function public.platform_decidir_pix(p_church_id uuid, p_aprovar boolean, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_igreja public.churches%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not public.is_platform_staff() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  select * into v_igreja from public.churches where id = p_church_id and deleted_at is null for update;
  if v_igreja.id is null or v_igreja.pix_chave is null
     or v_igreja.pix_aprovado_em is not null or v_igreja.pix_recusado_em is not null then
    raise exception 'não há chave aguardando aprovação' using errcode = 'P0002';
  end if;

  if coalesce(p_aprovar, false) then
    update public.churches
       set pix_aprovado_em = now(), pix_aprovado_por = auth.uid(), pix_recusado_em = null, pix_recusa_motivo = null
     where id = p_church_id;
  else
    update public.churches
       set pix_recusado_em = now(), pix_recusa_motivo = left(v_motivo, 300), pix_aprovado_em = null, pix_aprovado_por = null
     where id = p_church_id;
  end if;

  -- Sem a chave no registro: só o suficiente para saber o que foi decidido.
  insert into public.platform_staff_actions (staff_user_id, action, entity_type, entity_id, via, metadata)
  values (
    auth.uid(),
    case when coalesce(p_aprovar, false) then 'church_pix.aprovado' else 'church_pix.recusado' end,
    'church',
    p_church_id,
    'painel',
    jsonb_build_object('titular', v_igreja.pix_titular, 'motivo', v_motivo)
  );
end;
$$;

revoke all on function public.platform_list_pix_pendentes() from public, anon, authenticated;
revoke all on function public.platform_decidir_pix(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.platform_list_pix_pendentes() to authenticated;
grant execute on function public.platform_decidir_pix(uuid, boolean, text) to authenticated;

-- A contagem de pendências da moderação ganha o Pix.
drop function public.platform_pending_counts();
create function public.platform_pending_counts()
returns table (alteracoes integer, contas_travadas integer, denuncias integer, pix integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer from public.sponsor_profile_changes where status = 'pendente'),
    (select count(*)::integer from public.sponsor_accounts
      where security_hold_at is not null and deleted_at is null),
    (select count(*)::integer from public.sponsor_abuse_reports where status = 'aberta'),
    (select count(*)::integer from public.churches
      where deleted_at is null and pix_chave is not null and pix_aprovado_em is null and pix_recusado_em is null)
  where public.is_platform_staff();
$$;

revoke all on function public.platform_pending_counts() from public, anon, authenticated;
grant execute on function public.platform_pending_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. "Nossas igrejas" só lista página que está no ar
-- ---------------------------------------------------------------------------
create or replace function public.rede_igrejas_publicas(p_church_id uuid)
returns table (
  id uuid,
  name text,
  sobrenome text,
  address text,
  public_code text,
  tipo text,
  logo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.sobrenome, c.address, c.public_code, c.tipo, c.logo_url
  from public.churches s
  join public.churches c on c.path <@ s.path and c.id <> s.id
  where s.id = p_church_id and s.parent_id is null and s.deleted_at is null
    and c.deleted_at is null
    and c.pagina_ativa
  order by c.name
  limit 1000;
$$;

notify pgrst, 'reload schema';
