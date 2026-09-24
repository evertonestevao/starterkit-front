-- ---------------------------------------------------------------------------
-- Campanhas de arrecadação
-- ---------------------------------------------------------------------------
-- A igreja publica uma campanha (reforma, ação social, evento) com meta e
-- história, e escolhe COMO recebe: PIX direto (sem taxa, confirmação manual
-- pela equipe da igreja) ou cartão pela subconta já existente em
-- `church_payment_accounts` (confirmação automática pelo webhook, valor
-- creditado já líquido da taxa do provedor). As duas formas nunca coexistem
-- na mesma campanha — é uma escolha na criação.
--
-- `total_arrecadado_liquido_cents` só é alterado pelas funções abaixo (RPC de
-- confirmação PIX) ou pelo repository do webhook (service_role): nunca pelo
-- GRANT direto de `authenticated`, senão a igreja poderia inflar o próprio
-- progresso pela API.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,

  titulo text not null check (char_length(titulo) between 2 and 120),
  foto_capa_url text,
  historia text not null check (char_length(historia) between 10 and 8000),
  meta_cents integer not null check (meta_cents > 0 and meta_cents <= 100000000),
  total_arrecadado_liquido_cents integer not null default 0
    check (total_arrecadado_liquido_cents >= 0),

  metodo_recebimento text not null check (metodo_recebimento in ('pix', 'gateway')),

  -- Vem ativa por padrão (regra do produto); a igreja pode desligar.
  mostrar_progresso boolean not null default true,
  -- Até 3 valores sugeridos (centavos), validados de verdade no service —
  -- aqui só o formato: um array json de no máximo 3 posições.
  valores_sugeridos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(valores_sugeridos) = 'array' and jsonb_array_length(valores_sugeridos) <= 3),
  valor_padrao_cents integer check (valor_padrao_cents is null or valor_padrao_cents > 0),
  permitir_valor_livre boolean not null default true,

  status text not null default 'rascunho' check (status in ('rascunho', 'ativa', 'encerrada')),

  -- Devolutiva opcional, só faz sentido depois de encerrada (regra do service).
  feedback_texto text check (feedback_texto is null or char_length(feedback_texto) <= 4000),
  feedback_foto_url text,
  encerrada_at timestamptz,

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.campaigns is
  'Campanhas de arrecadação da igreja, com meta, progresso e forma de recebimento.';

create index if not exists campaigns_church_idx
  on public.campaigns (church_id)
  where deleted_at is null;

drop trigger if exists set_campaigns_company_id on public.campaigns;
create trigger set_campaigns_company_id
  before insert or update of church_id on public.campaigns
  for each row execute function public.set_company_id_from_church();

drop trigger if exists set_campaigns_updated_at on public.campaigns;
create trigger set_campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

alter table public.campaigns enable row level security;
revoke all on public.campaigns from anon, authenticated;

-- Campanha em rascunho não é pública — só ativa/encerrada, e sem soft delete.
grant select on public.campaigns to anon, authenticated;
create policy "campaigns_select_public"
  on public.campaigns for select
  to anon, authenticated
  using (status in ('ativa', 'encerrada') and deleted_at is null);

create policy "campaigns_select_admin"
  on public.campaigns for select
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id));

-- `total_arrecadado_liquido_cents` de propósito FORA destas duas listas: só
-- muda pelas funções no fim do arquivo (PIX) ou pelo repository do webhook
-- (cartão, com service_role). A ORDEM válida de status (rascunho -> ativa ->
-- encerrada) fica liberada aqui no grant, mas é validada no service — CLAUDE.md
-- pede replicar a checagem sensível na aplicação, não confiar só na RLS.
grant insert (
  church_id, titulo, foto_capa_url, historia, meta_cents, metodo_recebimento,
  mostrar_progresso, valores_sugeridos, valor_padrao_cents, permitir_valor_livre
) on public.campaigns to authenticated;

grant update (
  titulo, foto_capa_url, historia, meta_cents, metodo_recebimento,
  mostrar_progresso, valores_sugeridos, valor_padrao_cents, permitir_valor_livre,
  status, feedback_texto, feedback_foto_url, encerrada_at, deleted_at
) on public.campaigns to authenticated;

create policy "campaigns_insert_admin"
  on public.campaigns for insert
  to authenticated
  with check (
    exists (
      select 1 from public.churches c
      where c.id = church_id and public.is_company_admin(c.company_id)
    )
  );

create policy "campaigns_update_admin"
  on public.campaigns for update
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id))
  with check (company_id is not null and public.is_company_admin(company_id));

grant select, update on public.campaigns to service_role;

-- ---------------------------------------------------------------------------
-- Doações de uma campanha
-- ---------------------------------------------------------------------------
-- Ao contrário de church_donations (cartão avulso, sem dado de quem doou),
-- aqui GUARDAMOS nome e telefone: o PIX direto depende disso para a igreja
-- conferir o comprovante recebido pelo WhatsApp contra o "pendente" da tela.
create table if not exists public.campaign_donations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,

  doador_nome text not null check (char_length(doador_nome) between 2 and 120),
  doador_telefone text check (doador_telefone is null or char_length(doador_telefone) between 8 and 20),

  valor_bruto_cents integer not null check (valor_bruto_cents > 0),
  -- Só fica sabido quando a doação é confirmada: PIX = igual ao bruto (sem
  -- taxa); cartão = o que o provedor informar no webhook (bruto - taxa).
  valor_liquido_cents integer check (valor_liquido_cents is null or valor_liquido_cents >= 0),
  taxa_cents integer check (taxa_cents is null or taxa_cents >= 0),

  metodo text not null check (metodo in ('pix', 'gateway')),
  status text not null default 'pendente' check (status in ('pendente', 'confirmada', 'recusada')),

  -- Id do pagamento no provedor (cartão). Único quando presente: cada
  -- pagamento da Asaas vira no máximo uma linha, mesmo com reentrega de webhook.
  referencia_externa text,
  confirmada_por uuid references auth.users (id),
  confirmada_em timestamptz,

  created_at timestamptz not null default now()
);

comment on table public.campaign_donations is
  'Doações recebidas por uma campanha, pendentes (PIX) ou confirmadas (PIX manual ou cartão via webhook).';

create index if not exists campaign_donations_campaign_idx
  on public.campaign_donations (campaign_id, created_at desc);

create unique index if not exists campaign_donations_referencia_externa_idx
  on public.campaign_donations (referencia_externa)
  where referencia_externa is not null;

create or replace function public.set_company_id_from_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select c.company_id into new.company_id
  from public.campaigns c
  where c.id = new.campaign_id;

  return new;
end;
$$;

drop trigger if exists set_campaign_donations_company_id on public.campaign_donations;
create trigger set_campaign_donations_company_id
  before insert or update of campaign_id on public.campaign_donations
  for each row execute function public.set_company_id_from_campaign();

alter table public.campaign_donations enable row level security;
revoke all on public.campaign_donations from anon, authenticated;

-- Nada de SELECT para anon: nome e telefone de quem doa são privados. A
-- barra de progresso pública lê só campaigns.total_arrecadado_liquido_cents.
grant select on public.campaign_donations to authenticated;
create policy "campaign_donations_select_admin"
  on public.campaign_donations for select
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id));

-- Sem INSERT/UPDATE para anon/authenticated: toda escrita pública passa pelas
-- funções abaixo (mesmo padrão de sign_up_for_event), e a confirmação por
-- cartão é só do repository do webhook, com service_role.
grant select, insert, update on public.campaign_donations to service_role;

-- ---------------------------------------------------------------------------
-- Escrita pública: pedido de doação PIX
-- ---------------------------------------------------------------------------
create or replace function public.criar_doacao_pix_campanha(
  p_campaign_id uuid,
  p_nome text,
  p_telefone text,
  p_valor_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_campanha public.campaigns%rowtype;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_telefone text := btrim(coalesce(p_telefone, ''));
  v_id uuid;
begin
  if char_length(v_nome) not between 2 and 120 then
    raise exception 'Informe seu nome' using errcode = 'P0001';
  end if;
  if char_length(v_telefone) not between 8 and 20 then
    raise exception 'Informe um telefone para contato' using errcode = 'P0001';
  end if;
  if p_valor_cents is null or p_valor_cents <= 0 then
    raise exception 'Informe um valor válido' using errcode = 'P0001';
  end if;

  select * into v_campanha
  from public.campaigns
  where id = p_campaign_id and deleted_at is null;

  if v_campanha.id is null then
    raise exception 'Campanha não encontrada' using errcode = 'P0002';
  end if;
  if v_campanha.status <> 'ativa' then
    raise exception 'Esta campanha não está recebendo doações no momento' using errcode = 'P0001';
  end if;
  if v_campanha.metodo_recebimento <> 'pix' then
    raise exception 'Esta campanha não recebe por PIX' using errcode = 'P0001';
  end if;

  insert into public.campaign_donations (campaign_id, doador_nome, doador_telefone, valor_bruto_cents, metodo, status)
  values (v_campanha.id, v_nome, v_telefone, p_valor_cents, 'pix', 'pendente')
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.criar_doacao_pix_campanha(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.criar_doacao_pix_campanha(uuid, text, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Escrita pública: início de uma doação por cartão (o valor líquido só chega
-- depois, pelo webhook — aqui só reservamos a linha 'pendente' e devolvemos o
-- id, que o service usa como referência externa ao criar a cobrança na Asaas).
-- ---------------------------------------------------------------------------
create or replace function public.registrar_doacao_gateway_campanha(
  p_campaign_id uuid,
  p_nome text,
  p_telefone text,
  p_valor_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_campanha public.campaigns%rowtype;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_telefone text := nullif(btrim(coalesce(p_telefone, '')), '');
  v_id uuid;
begin
  if char_length(v_nome) not between 2 and 120 then
    raise exception 'Informe seu nome' using errcode = 'P0001';
  end if;
  if v_telefone is not null and char_length(v_telefone) not between 8 and 20 then
    raise exception 'Telefone inválido' using errcode = 'P0001';
  end if;
  if p_valor_cents is null or p_valor_cents <= 0 then
    raise exception 'Informe um valor válido' using errcode = 'P0001';
  end if;

  select * into v_campanha
  from public.campaigns
  where id = p_campaign_id and deleted_at is null;

  if v_campanha.id is null then
    raise exception 'Campanha não encontrada' using errcode = 'P0002';
  end if;
  if v_campanha.status <> 'ativa' then
    raise exception 'Esta campanha não está recebendo doações no momento' using errcode = 'P0001';
  end if;
  if v_campanha.metodo_recebimento <> 'gateway' then
    raise exception 'Esta campanha não recebe por cartão' using errcode = 'P0001';
  end if;

  insert into public.campaign_donations (campaign_id, doador_nome, doador_telefone, valor_bruto_cents, metodo, status)
  values (v_campanha.id, v_nome, v_telefone, p_valor_cents, 'gateway', 'pendente')
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.registrar_doacao_gateway_campanha(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.registrar_doacao_gateway_campanha(uuid, text, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Confirmação manual do PIX (a equipe financeira conferiu o extrato/comprovante)
-- ---------------------------------------------------------------------------
create or replace function public.confirmar_doacao_pix(p_donation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_doacao public.campaign_donations%rowtype;
begin
  select * into v_doacao
  from public.campaign_donations
  where id = p_donation_id;

  if v_doacao.id is null then
    raise exception 'Doação não encontrada' using errcode = 'P0002';
  end if;
  if v_doacao.company_id is null or not public.is_company_admin(v_doacao.company_id) then
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
$fn$;

revoke all on function public.confirmar_doacao_pix(uuid) from public, anon, authenticated;
grant execute on function public.confirmar_doacao_pix(uuid) to authenticated;

notify pgrst, 'reload schema';
