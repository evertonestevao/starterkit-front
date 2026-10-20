-- Domínio próprio por igreja.
--
-- Duas coisas acontecem aqui, e a primeira é pré-requisito da segunda:
--
-- 1. `churches` ganha DONO (company_id) e soft delete. A tabela nasceu solta na
--    migration do core e sua única policy de UPDATE dependia de
--    `auth_church_id()`, que retorna NULL fixo — na prática ninguém editava
--    igreja nenhuma, e não existia resposta para "quem pode alterar esta
--    linha?". Sem essa resposta não há como liberar a escrita de domínio com
--    segurança: quem escreve `dominio_customizado` decide para onde o tráfego
--    daquele host é roteado.
--
-- 2. Os campos de domínio, com escrita SÓ por RPC security definer (o client
--    não recebe GRANT de UPDATE nessas colunas). Motivo: `dominio_status`
--    controla o proxy. Um admin que pudesse escrever a coluna direto marcaria
--    `ativo` sem nunca provar posse do DNS, e reservaria domínios de terceiros.
--    A transição para `ativo` é privilégio do job de verificação (service_role).

create type public.church_domain_status as enum (
  'nao_configurado',
  'pendente_dns',
  'verificando',
  'ativo',
  'erro'
);

alter table public.churches
  -- Nullable de propósito: as igrejas de demonstração semeadas na migration do
  -- core não têm empresa e não podem ganhar uma arbitrariamente (seriam
  -- entregues a um tenant real). Elas continuam públicas e sem dono; o CHECK
  -- abaixo garante que igreja sem dono jamais segura um domínio. Quando as
  -- linhas de demo forem embora, esta coluna vira NOT NULL.
  add column company_id uuid references public.companies (id) on delete cascade,
  add column deleted_at timestamptz,
  add column dominio_customizado text,
  add column dominio_status public.church_domain_status not null default 'nao_configurado',
  -- Flag comercial interna: registra quem contratou a configuração assistida.
  -- Não altera nada no fluxo técnico de DNS/verificação.
  add column dominio_suporte_pago boolean not null default false,
  -- Desafio de verificação devolvido pela Vercel (registro TXT), quando exigido.
  add column dominio_verificacao jsonb,
  add column dominio_verificado_em timestamptz,
  -- Motivo legível do último erro, exibido na UI. Nunca recebe corpo cru da API.
  add column dominio_ultimo_erro text,
  -- Quando o domínio entrou em pendente_dns: base para desistir após N dias.
  add column dominio_solicitado_em timestamptz;

alter table public.churches
  add constraint churches_dominio_formato check (
    dominio_customizado is null
    or dominio_customizado ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  ),
  add constraint churches_dominio_exige_dono check (
    dominio_customizado is null or company_id is not null
  ),
  add constraint churches_dominio_status_coerente check (
    dominio_customizado is not null or dominio_status = 'nao_configurado'
  );

-- Unicidade global do domínio: dois tenants não podem reivindicar o mesmo host.
create unique index churches_dominio_customizado_key
  on public.churches (dominio_customizado)
  where dominio_customizado is not null;

create index churches_company_id_idx
  on public.churches (company_id)
  where deleted_at is null;

-- Fila do job de verificação.
create index churches_dominio_pendente_idx
  on public.churches (dominio_status)
  where dominio_status in ('pendente_dns', 'verificando');

-- ---------------------------------------------------------------------------
-- Resolução host -> igreja (usada pelo proxy, com a chave anon)
-- ---------------------------------------------------------------------------
-- security definer + retorno mínimo: o proxy precisa de UM mapeamento, não de
-- acesso de leitura à tabela de domínios. Só domínio ATIVO resolve — domínio
-- pendente ou em erro nunca serve página, o que mantém o endereço padrão como
-- caminho sempre válido de acesso à igreja.
create or replace function public.resolve_church_by_domain(p_host text)
returns table (id uuid, public_code text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.public_code
  from public.churches c
  where c.dominio_customizado = lower(trim(p_host))
    and c.dominio_status = 'ativo'
    and c.deleted_at is null
  limit 1;
$$;

grant execute on function public.resolve_church_by_domain(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Escrita dos campos de domínio (RPCs security definer)
-- ---------------------------------------------------------------------------
-- Reivindicar é o primeiro passo do fluxo: grava o domínio como pendente ANTES
-- da chamada à Vercel. A ordem importa — é o índice único do banco que resolve
-- a corrida entre dois tenants pedindo o mesmo host, não a API externa.
create or replace function public.claim_church_domain(p_church_id uuid, p_domain text)
returns public.churches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_church public.churches;
  v_domain text := lower(trim(p_domain));
begin
  select * into v_church from public.churches where id = p_church_id and deleted_at is null;

  if v_church.id is null then
    raise exception 'igreja nao encontrada' using errcode = 'no_data_found';
  end if;

  if v_church.company_id is null or not public.is_company_admin(v_church.company_id) then
    raise exception 'sem permissao para alterar o dominio desta igreja' using errcode = 'insufficient_privilege';
  end if;

  update public.churches
  set dominio_customizado = v_domain,
      dominio_status = 'pendente_dns',
      dominio_verificacao = null,
      dominio_verificado_em = null,
      dominio_ultimo_erro = null,
      dominio_solicitado_em = now()
  where id = p_church_id
  returning * into v_church;

  return v_church;
end;
$$;

-- Guarda o desafio de DNS devolvido pela Vercel logo após o add. Separada do
-- claim porque acontece depois da chamada de rede, e refaz a checagem de papel.
create or replace function public.set_church_domain_verification(
  p_church_id uuid,
  p_verificacao jsonb,
  p_status public.church_domain_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id
  from public.churches
  where id = p_church_id and deleted_at is null;

  if v_company_id is null or not public.is_company_admin(v_company_id) then
    raise exception 'sem permissao para alterar o dominio desta igreja' using errcode = 'insufficient_privilege';
  end if;

  -- 'ativo' é deliberadamente inalcançável por aqui: só o job de verificação
  -- (service_role), que confere DNS e SSL na Vercel, promove um domínio.
  if p_status = 'ativo' then
    raise exception 'ativacao de dominio nao pode partir do client' using errcode = 'insufficient_privilege';
  end if;

  update public.churches
  set dominio_verificacao = p_verificacao,
      dominio_status = p_status
  where id = p_church_id;
end;
$$;

-- Remover o domínio devolve a igreja ao estado padrão (endereço por public_code,
-- que nunca deixou de funcionar).
create or replace function public.clear_church_domain(p_church_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id
  from public.churches
  where id = p_church_id and deleted_at is null;

  if v_company_id is null or not public.is_company_admin(v_company_id) then
    raise exception 'sem permissao para alterar o dominio desta igreja' using errcode = 'insufficient_privilege';
  end if;

  update public.churches
  set dominio_customizado = null,
      dominio_status = 'nao_configurado',
      dominio_verificacao = null,
      dominio_verificado_em = null,
      dominio_ultimo_erro = null,
      dominio_solicitado_em = null
  where id = p_church_id;
end;
$$;

grant execute on function public.claim_church_domain(uuid, text) to authenticated;
grant execute on function public.set_church_domain_verification(uuid, jsonb, public.church_domain_status) to authenticated;
grant execute on function public.clear_church_domain(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- GRANTs e policies
-- ---------------------------------------------------------------------------
-- UPDATE por coluna: as colunas de domínio ficam de fora, então mesmo um owner
-- só as altera pelas RPCs acima. `auth_church_id()` some junto com a policy que
-- dependia dela.
drop policy if exists "churches_update_same_church" on public.churches;
drop function if exists public.auth_church_id();

revoke update on public.churches from authenticated;
grant update (
  name,
  logo_url,
  address,
  service_times,
  social_links,
  template_mode,
  template_id,
  deleted_at
) on public.churches to authenticated;

create policy "churches_update_company_admin"
  on public.churches
  for update
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id))
  with check (company_id is not null and public.is_company_admin(company_id));

-- INSERT de igreja já nasce vinculado à empresa ativa do usuário.
create policy "churches_insert_company_admin"
  on public.churches
  for insert
  to authenticated
  with check (company_id is not null and public.is_company_admin(company_id));

-- SELECT do anon por coluna: a página pública não precisa saber o status do
-- domínio nem quem contratou suporte pago (informação comercial interna).
-- Consultas anônimas passam a listar colunas explicitamente — `select *` falha
-- com permission denied, e é isso que queremos que aconteça.
revoke select on public.churches from anon;
grant select (
  id,
  parent_id,
  name,
  slug,
  logo_url,
  address,
  service_times,
  social_links,
  path,
  template_mode,
  template_id,
  public_code,
  created_at,
  updated_at
) on public.churches to anon;

-- A policy pública de SELECT segue valendo (página da igreja é pública por
-- natureza); o recorte de colunas acima é que limita o que o anon enxerga.
