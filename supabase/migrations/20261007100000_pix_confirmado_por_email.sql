-- Chave Pix confirmada por e-mail pelo Responsável da igreja.
--
-- Antes: toda chave nova esperava a moderação da plataforma aprovar. Para um
-- piloto fechado isso só cria fila: quem conhece a igreja é o pastor, não a
-- plataforma.
--
-- Agora: ao salvar a chave, o Responsável (owner da conta) recebe um e-mail
-- com um link. A chave só vai para a página depois que ele abre o link e
-- confirma. O que isso protege: uma sessão roubada (ou um administrador
-- agindo sozinho) não publica uma chave — precisa também da caixa de e-mail do
-- Responsável. A moderação continua podendo aprovar ou recusar, como reserva.
--
-- Duas regras que seguram o desenho:
--   * o pedido de confirmação só é criado com `service_role`. Se o próprio
--     usuário pudesse criar, escolheria o token e confirmaria sozinho;
--   * o banco guarda só o hash do token, e a confirmação recebe o token puro e
--     faz o hash aqui dentro — quem ler a tabela não monta um link válido.

create table public.church_pix_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  token_hash text not null unique,
  -- A chave que ESTE link confirma: se a igreja trocar depois, o link morre.
  pix_chave text not null,
  pix_titular text,
  solicitado_por uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  usado_em timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index church_pix_confirmacoes_church_idx on public.church_pix_confirmacoes (church_id);

alter table public.church_pix_confirmacoes enable row level security;

-- Ninguém lê nem escreve pela API: só as funções abaixo.
revoke all on table public.church_pix_confirmacoes from public, anon, authenticated;

create policy church_pix_confirmacoes_ninguem on public.church_pix_confirmacoes
  for all to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 1. Criar o pedido (só o servidor, com service_role)
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

  -- Quem confirma é o Responsável (owner) da conta dona da igreja.
  return query
  select u.email::text
  from public.company_members cm
  join auth.users u on u.id = cm.user_id
  where cm.company_id = v_igreja.company_id
    and cm.deleted_at is null
    and cm.role = 'owner'
    and u.email is not null;
end;
$$;

revoke all on function public.pix_criar_confirmacao(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.pix_criar_confirmacao(uuid, text, uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Abrir o link: o que ele confirma (sem login — quem tem o link é quem
--    recebeu o e-mail)
-- ---------------------------------------------------------------------------
create or replace function public.pix_confirmacao_por_token(p_token text)
returns table (estado text, church_name text, pix_chave text, pix_titular text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with pedido as (
    select k.*, c.name as igreja, c.pix_chave as chave_atual, c.pix_titular as titular_atual,
           c.pix_aprovado_em, c.pix_recusado_em, c.deleted_at as igreja_apagada
    from public.church_pix_confirmacoes k
    join public.churches c on c.id = k.church_id
    where k.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  ), avaliado as (
    select p.*,
      case
        when p.usado_em is not null then 'usado'
        when p.deleted_at is not null or p.igreja_apagada is not null
          or p.chave_atual is distinct from p.pix_chave or p.titular_atual is distinct from p.pix_titular
          or p.pix_aprovado_em is not null or p.pix_recusado_em is not null then 'substituido'
        when p.expires_at <= now() then 'expirado'
        else 'valido'
      end as situacao
    from pedido p
  )
  -- A chave só é devolvida enquanto o link vale.
  select a.situacao, a.igreja,
         case when a.situacao = 'valido' then a.pix_chave end,
         case when a.situacao = 'valido' then a.pix_titular end,
         a.expires_at
  from avaliado a;
$$;

revoke all on function public.pix_confirmacao_por_token(text) from public, anon, authenticated;
grant execute on function public.pix_confirmacao_por_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Confirmar
-- ---------------------------------------------------------------------------
create or replace function public.pix_confirmar_por_token(p_token text)
returns table (church_name text, public_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.church_pix_confirmacoes%rowtype;
  v_igreja public.churches%rowtype;
begin
  select * into v_pedido
  from public.church_pix_confirmacoes
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;

  if v_pedido.id is not null then
    select * into v_igreja from public.churches where id = v_pedido.church_id and deleted_at is null for update;
  end if;

  -- Uma resposta só para tudo o que não vale: inexistente, usado, vencido,
  -- substituído por outro pedido ou por outra chave.
  if v_pedido.id is null or v_igreja.id is null
     or v_pedido.usado_em is not null or v_pedido.deleted_at is not null or v_pedido.expires_at <= now()
     or v_igreja.pix_chave is distinct from v_pedido.pix_chave
     or v_igreja.pix_titular is distinct from v_pedido.pix_titular
     or v_igreja.pix_aprovado_em is not null or v_igreja.pix_recusado_em is not null then
    raise exception 'link de confirmação inválido' using errcode = 'P0002';
  end if;

  update public.churches set pix_aprovado_em = now(), pix_aprovado_por = null where id = v_igreja.id;
  update public.church_pix_confirmacoes set usado_em = now() where id = v_pedido.id;

  -- Sem a chave no registro, como nas outras trilhas do Pix.
  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_pedido.company_id, null, 'church.pix.confirmado_por_email', 'church', v_igreja.id,
    jsonb_build_object('titular', v_igreja.pix_titular, 'solicitado_por', v_pedido.solicitado_por)
  );

  return query select v_igreja.name, v_igreja.public_code;
end;
$$;

revoke all on function public.pix_confirmar_por_token(text) from public, anon, authenticated;
grant execute on function public.pix_confirmar_por_token(text) to anon, authenticated;

notify pgrst, 'reload schema';
