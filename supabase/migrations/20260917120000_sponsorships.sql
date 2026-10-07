-- Patrocínio pago de igrejas.
--
-- MODELO DE PREÇO (a parte que importa):
--   O preço NÃO pertence à igreja; pertence à POSIÇÃO. Com N patrocínios
--   cobráveis, o total é a soma dos tiers das posições 1..N (a maior posição
--   da tabela vale "daí em diante"). Por isso não existe coluna de preço em
--   `sponsorships`: o valor é calculado na hora, em src/services/sponsorPricing.
--   A única gravação de valor por igreja é o SNAPSHOT em
--   `sponsor_charge_items`, feito quando a cobrança do ciclo nasce — o
--   histórico não muda se a tabela de tiers for reajustada depois.
--
-- EXCEÇÃO MULTI-TENANT (aprovada): `sponsor_accounts` não tem company_id.
--   O patrocinador atravessa várias igrejas/empresas; o dono da linha é o
--   usuário (user_id). As tabelas que tocam uma igreja carregam company_id.
--
-- ESCRITA: o client só cria/edita o próprio perfil (colunas liberadas por
--   GRANT) e pede/cancela patrocínio por RPC. Status de cobrança, ids do
--   gateway e cobranças são escritos só por service_role (webhook, job).

-- ---------------------------------------------------------------------------
-- Tabela de preços por posição
-- ---------------------------------------------------------------------------
-- Catálogo global (como `plans`): sem company_id, sem escrita pelo client.
create table public.sponsor_price_tiers (
  id uuid primary key default gen_random_uuid(),
  position integer not null unique check (position >= 1),
  amount_cents integer not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_sponsor_price_tiers_updated_at
  before update on public.sponsor_price_tiers
  for each row
  execute function public.set_updated_at();

-- Valores de exemplo; ajuste com UPDATE numa migration nova.
insert into public.sponsor_price_tiers (position, amount_cents) values
  (1, 3990),
  (2, 3490),
  (3, 2990),
  (4, 2790);

-- ---------------------------------------------------------------------------
-- Conta do patrocinador
-- ---------------------------------------------------------------------------
create table public.sponsor_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('person', 'business')),
  display_name text not null check (char_length(display_name) between 2 and 120),
  email text not null,
  phone text,
  -- Só dígitos. O gateway exige CPF/CNPJ para criar o cliente.
  document text not null check (document ~ '^([0-9]{11}|[0-9]{14})$'),
  logo_url text,
  -- Provedor que atende ESTA conta. Fica gravado por conta para que trocar o
  -- provedor padrão não quebre assinaturas que já rodam no antigo.
  gateway text,
  gateway_customer_id text,
  gateway_subscription_id text,
  billing_status text not null default 'none'
    check (billing_status in ('none', 'active', 'overdue', 'canceled')),
  -- Valor que o gateway está configurado para cobrar hoje.
  billed_amount_cents integer,
  -- 'pending' = o banco mudou e o gateway ainda não foi atualizado (job refaz).
  billing_sync_status text not null default 'synced'
    check (billing_sync_status in ('synced', 'pending', 'failed')),
  billing_synced_at timestamptz,
  next_due_date date,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_accounts_gateway_ids_need_gateway check (
    (gateway_customer_id is null and gateway_subscription_id is null) or gateway is not null
  )
);

create unique index sponsor_accounts_user_active_idx
  on public.sponsor_accounts (user_id)
  where deleted_at is null;

create unique index sponsor_accounts_gateway_subscription_idx
  on public.sponsor_accounts (gateway, gateway_subscription_id)
  where gateway_subscription_id is not null;

create index sponsor_accounts_sync_pending_idx
  on public.sponsor_accounts (billing_sync_status)
  where billing_sync_status <> 'synced';

create trigger set_sponsor_accounts_updated_at
  before update on public.sponsor_accounts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Patrocínio (patrocinador <-> igreja)
-- ---------------------------------------------------------------------------
create table public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsor_accounts (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  -- pending_payment: aguardando a 1ª cobrança da conta ser paga.
  -- active: conta na cobrança.
  -- cancel_scheduled: cancelado pelo patrocinador; segue exibido até ends_at,
  --   mas JÁ NÃO conta para o valor do próximo ciclo.
  status text not null
    check (status in ('pending_payment', 'active', 'cancel_scheduled', 'canceled')),
  -- Quando passou a contar na cobrança. A POSIÇÃO no ranking não vem daqui,
  -- vem de created_at (ordem em que o patrocinador escolheu as igrejas): o
  -- 1º pagamento ativa vários pendentes no mesmo instante, e a ordem não
  -- pode virar sorteio por id.
  activated_at timestamptz,
  cancel_requested_at timestamptz,
  ends_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsorships_active_has_activation check (
    status not in ('active', 'cancel_scheduled') or activated_at is not null
  )
);

-- Um patrocínio vivo por (patrocinador, igreja).
create unique index sponsorships_sponsor_church_live_idx
  on public.sponsorships (sponsor_id, church_id)
  where status in ('pending_payment', 'active', 'cancel_scheduled');

create index sponsorships_sponsor_idx on public.sponsorships (sponsor_id, status);
create index sponsorships_company_idx on public.sponsorships (company_id, status);
create index sponsorships_church_live_idx
  on public.sponsorships (church_id)
  where status in ('active', 'cancel_scheduled');

create trigger set_sponsorships_updated_at
  before update on public.sponsorships
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cobranças (uma por ciclo) e snapshot da divisão por igreja
-- ---------------------------------------------------------------------------
create table public.sponsor_charges (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsor_accounts (id) on delete cascade,
  gateway text not null,
  gateway_payment_id text not null,
  amount_cents integer not null check (amount_cents >= 0),
  -- N no momento em que a cobrança nasceu.
  active_count integer not null check (active_count >= 0),
  due_date date not null,
  paid_at timestamptz,
  status text not null
    check (status in ('pending', 'paid', 'overdue', 'refunded', 'canceled')),
  invoice_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_charges_gateway_payment_key unique (gateway, gateway_payment_id)
);

create index sponsor_charges_sponsor_idx on public.sponsor_charges (sponsor_id, due_date desc);

create trigger set_sponsor_charges_updated_at
  before update on public.sponsor_charges
  for each row
  execute function public.set_updated_at();

create table public.sponsor_charge_items (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.sponsor_charges (id) on delete cascade,
  sponsorship_id uuid not null references public.sponsorships (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  position integer not null check (position >= 1),
  amount_cents integer not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  -- Idempotência do webhook: reentregar o evento não duplica itens.
  constraint sponsor_charge_items_charge_sponsorship_key unique (charge_id, sponsorship_id)
);

create index sponsor_charge_items_company_idx on public.sponsor_charge_items (company_id);

-- ---------------------------------------------------------------------------
-- Funções auxiliares e RPCs
-- ---------------------------------------------------------------------------
create or replace function public.is_sponsor_owner(p_sponsor_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.sponsor_accounts sa
    where sa.id = p_sponsor_id
      and sa.user_id = auth.uid()
      and sa.deleted_at is null
  );
$$;

-- Funções nascem executáveis por PUBLIC (e o Supabase ainda concede a anon
-- por default privileges): tira de todos e devolve só a quem precisa.
revoke all on function public.is_sponsor_owner(uuid) from public, anon, authenticated;
grant execute on function public.is_sponsor_owner(uuid) to authenticated;

-- Pede um patrocínio. O STATUS inicial é decidido aqui, não pelo client:
-- conta com cobrança ativa -> 'active' na hora (o valor novo vale no próximo
-- ciclo); conta sem cobrança ativa -> 'pending_payment' até o 1º pagamento.
create or replace function public.request_sponsorship(p_church_id uuid)
returns public.sponsorships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.sponsor_accounts;
  v_company_id uuid;
  v_row public.sponsorships;
begin
  select * into v_account
  from public.sponsor_accounts
  where user_id = auth.uid() and deleted_at is null;

  if v_account.id is null then
    raise exception 'conta de patrocinador nao encontrada' using errcode = 'no_data_found';
  end if;

  if v_account.billing_status = 'overdue' then
    raise exception 'pagamento pendente' using errcode = 'check_violation';
  end if;

  select company_id into v_company_id
  from public.churches
  where id = p_church_id and deleted_at is null;

  -- Igreja sem dono (demonstração) não recebe patrocínio pago.
  if v_company_id is null then
    raise exception 'igreja nao encontrada' using errcode = 'no_data_found';
  end if;

  insert into public.sponsorships (sponsor_id, church_id, company_id, status, activated_at)
  values (
    v_account.id,
    p_church_id,
    v_company_id,
    case when v_account.billing_status = 'active' then 'active' else 'pending_payment' end,
    case when v_account.billing_status = 'active' then now() else null end
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- Cancela um patrocínio do próprio patrocinador.
-- Pendente de pagamento: cancela na hora (nunca foi cobrado).
-- Ativo: agenda para o fim do ciclo pago e sai do cálculo do próximo.
create or replace function public.cancel_sponsorship(p_sponsorship_id uuid)
returns public.sponsorships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.sponsorships;
  v_next_due date;
begin
  select s.* into v_row
  from public.sponsorships s
  join public.sponsor_accounts sa on sa.id = s.sponsor_id
  where s.id = p_sponsorship_id
    and sa.user_id = auth.uid()
    and sa.deleted_at is null;

  if v_row.id is null then
    raise exception 'patrocinio nao encontrado' using errcode = 'no_data_found';
  end if;

  if v_row.status = 'pending_payment' then
    update public.sponsorships
    set status = 'canceled', cancel_requested_at = now(), canceled_at = now(), ends_at = now()
    where id = v_row.id
    returning * into v_row;
  elsif v_row.status = 'active' then
    select next_due_date into v_next_due
    from public.sponsor_accounts where id = v_row.sponsor_id;

    update public.sponsorships
    set status = 'cancel_scheduled',
        cancel_requested_at = now(),
        ends_at = coalesce(v_next_due::timestamptz, now())
    where id = v_row.id
    returning * into v_row;
  end if;
  -- cancel_scheduled/canceled: idempotente, devolve como está.

  return v_row;
end;
$$;

-- Vitrine pública da igreja: só nome e logo de quem patrocina agora.
create or replace function public.list_church_sponsors(p_church_id uuid)
returns table (sponsorship_id uuid, display_name text, logo_url text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, sa.display_name, sa.logo_url
  from public.sponsorships s
  join public.sponsor_accounts sa on sa.id = s.sponsor_id
  where s.church_id = p_church_id
    and s.status in ('active', 'cancel_scheduled')
    and sa.deleted_at is null
  order by s.created_at asc, s.id asc;
$$;

revoke all on function public.request_sponsorship(uuid) from public, anon, authenticated;
revoke all on function public.cancel_sponsorship(uuid) from public, anon, authenticated;
revoke all on function public.list_church_sponsors(uuid) from public, anon, authenticated;
grant execute on function public.request_sponsorship(uuid) to authenticated;
grant execute on function public.cancel_sponsorship(uuid) to authenticated;
grant execute on function public.list_church_sponsors(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS e GRANTs
-- ---------------------------------------------------------------------------
-- ATENÇÃO: no Supabase, tabela nova em `public` nasce com ALL para anon e
-- authenticated (default privileges da plataforma). A segurança por COLUNA
-- abaixo só vale se partir do zero — daí o REVOKE ALL antes de cada GRANT.
-- Sem ele, o patrocinador gravaria billing_status na própria conta (a policy
-- libera a linha dele; o GRANT padrão liberaria a coluna).
revoke all on public.sponsor_price_tiers from anon, authenticated;
revoke all on public.sponsor_accounts from anon, authenticated;
revoke all on public.sponsorships from anon, authenticated;
revoke all on public.sponsor_charges from anon, authenticated;
revoke all on public.sponsor_charge_items from anon, authenticated;

alter table public.sponsor_price_tiers enable row level security;
alter table public.sponsor_accounts enable row level security;
alter table public.sponsorships enable row level security;
alter table public.sponsor_charges enable row level security;
alter table public.sponsor_charge_items enable row level security;

-- Tiers: preço é público (aparece no link de patrocínio).
grant select on public.sponsor_price_tiers to anon, authenticated;
create policy "sponsor_price_tiers_select_public"
  on public.sponsor_price_tiers for select
  to anon, authenticated
  using (true);

-- Conta: o próprio usuário. Campos de cobrança ficam fora dos GRANTs de
-- escrita — só service_role mexe em gateway/status/valor.
grant select on public.sponsor_accounts to authenticated;
grant insert (user_id, kind, display_name, email, phone, document, logo_url)
  on public.sponsor_accounts to authenticated;
-- kind e document ficam fixos após o cadastro: trocar pessoa por empresa
-- deixaria o documento inconsistente com o cliente já criado no gateway.
grant update (display_name, phone, logo_url)
  on public.sponsor_accounts to authenticated;

create policy "sponsor_accounts_select_own"
  on public.sponsor_accounts for select
  to authenticated
  using (user_id = auth.uid() and deleted_at is null);

create policy "sponsor_accounts_insert_own"
  on public.sponsor_accounts for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "sponsor_accounts_update_own"
  on public.sponsor_accounts for update
  to authenticated
  using (user_id = auth.uid() and deleted_at is null)
  with check (user_id = auth.uid());

-- Patrocínios: leitura pelo patrocinador e pelo admin da igreja. Escrita
-- só pelas RPCs acima (sem GRANT de insert/update para o client).
grant select on public.sponsorships to authenticated;

create policy "sponsorships_select_sponsor"
  on public.sponsorships for select
  to authenticated
  using (public.is_sponsor_owner(sponsor_id));

create policy "sponsorships_select_church_admin"
  on public.sponsorships for select
  to authenticated
  using (public.is_company_admin(company_id));

-- Cobranças: só o próprio patrocinador lê; escrita só pelo webhook.
grant select on public.sponsor_charges to authenticated;

create policy "sponsor_charges_select_own"
  on public.sponsor_charges for select
  to authenticated
  using (public.is_sponsor_owner(sponsor_id));

grant select on public.sponsor_charge_items to authenticated;

create policy "sponsor_charge_items_select_sponsor"
  on public.sponsor_charge_items for select
  to authenticated
  using (
    exists (
      select 1 from public.sponsor_charges c
      where c.id = charge_id and public.is_sponsor_owner(c.sponsor_id)
    )
  );

create policy "sponsor_charge_items_select_church_admin"
  on public.sponsor_charge_items for select
  to authenticated
  using (public.is_company_admin(company_id));

-- ---------------------------------------------------------------------------
-- Substitui a vitrine antiga
-- ---------------------------------------------------------------------------
-- `public.sponsors` era uma lista de logos com policies using(true): qualquer
-- usuário logado editava ou apagava patrocinador de qualquer igreja. A
-- vitrine agora sai de `sponsorships` via list_church_sponsors().
drop table if exists public.sponsors;
