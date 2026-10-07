-- ---------------------------------------------------------------------------
-- Autopatrocínio: igreja sem patrocinador pode assumir a própria mensalidade
-- ---------------------------------------------------------------------------
-- Regra combinada com o usuário (2026-09-26):
--   - Igreja SEM nenhum patrocinador (de verdade) pode assumir a própria
--     mensalidade. Enquanto ela tem patrocinador ativo, essa escolha fica
--     bloqueada.
--   - Quando um patrocinador de verdade entra, o autopatrocínio é cancelado
--     como qualquer patrocínio se cancela: continua até o fim do ciclo já
--     pago (cancel_scheduled/ends_at), sem cortar nem estornar nada.
--   - Quando o ÚLTIMO patrocinador de verdade sai, o autopatrocínio NÃO
--     reativa sozinho (cobraria o cartão da igreja sem ela pedir). A igreja
--     é avisada (dashboard + email) e decide se assina de novo.
--   - A igreja também escolhe, só enquanto sem patrocinador, se fecha a
--     porta pra patrocinador (o espaço some da LP) ou continua aberta.
--
-- MODELO: reaproveita sponsor_accounts/sponsorships por inteiro — é a mesma
-- cobrança recorrente, só que de valor FIXO (não por posição) e sem dono
-- pessoal. A chave é `church_id`, não `company_id`: uma empresa pode ter mais
-- de uma igreja (ver dashboard/settings/domain), e cada igreja assume a
-- PRÓPRIA mensalidade — a de uma não pode contar como a de outra da mesma
-- empresa. A exceção multi-tenant documentada em 20260917120000 (sponsor_
-- accounts sem company_id) segue valendo só para as contas normais.

alter table public.sponsor_accounts
  add column church_id uuid references public.churches (id) on delete cascade,
  add column company_id uuid references public.companies (id) on delete cascade,
  add column is_self_payment boolean not null default false;

alter table public.sponsor_accounts alter column user_id drop not null;

alter table public.sponsor_accounts
  add constraint sponsor_accounts_self_payment_shape check (
    (is_self_payment and user_id is null and church_id is not null and company_id is not null)
    or (not is_self_payment and user_id is not null and church_id is null and company_id is null)
  );

-- Troca a mesma checagem de antes (um patrocinador pessoal por usuário) por
-- uma versão que ignora as linhas de autopatrocínio (user_id nulo nelas).
drop index if exists sponsor_accounts_user_active_idx;
create unique index sponsor_accounts_user_active_idx
  on public.sponsor_accounts (user_id)
  where deleted_at is null and user_id is not null;

-- Uma conta de autopatrocínio por IGREJA (não por empresa: uma empresa pode
-- ter mais de uma igreja).
create unique index sponsor_accounts_church_self_idx
  on public.sponsor_accounts (church_id)
  where deleted_at is null and is_self_payment;

comment on column public.sponsor_accounts.church_id is
  'Só para is_self_payment: a igreja que a conta mantém (uma por igreja).';
comment on column public.sponsor_accounts.company_id is
  'Só para is_self_payment: denormalizado de church_id, para a mesma checagem de admin usada em sponsorships.company_id.';
comment on column public.sponsor_accounts.is_self_payment is
  'true = conta de autopatrocínio (a própria igreja se mantendo), criada pelo sistema, nunca pelo formulário normal de patrocinador.';

-- A leitura por igreja que faltava (a de user_id já existe desde 20260917120000).
create policy "sponsor_accounts_select_church_admin"
  on public.sponsor_accounts for select
  to authenticated
  using (is_self_payment and public.is_company_admin(company_id) and deleted_at is null);

-- ---------------------------------------------------------------------------
-- Igreja: abrir ou fechar a porta para patrocinador
-- ---------------------------------------------------------------------------
alter table public.churches
  add column aceita_patrocinio boolean not null default true;

comment on column public.churches.aceita_patrocinio is
  'false = a igreja fechou a porta pra patrocinador (só possível sem nenhum patrocinador ativo); some da LP.';

-- anon só lê churches por coluna explícita (20260917180000): sem isto, a
-- página pública não saberia se esconde o espaço de patrocinador.
grant select (aceita_patrocinio) on public.churches to anon;

-- ---------------------------------------------------------------------------
-- Preço do autopatrocínio: fixo, editável pela plataforma (mesmo painel dos
-- outros preços — 20260926150000).
-- ---------------------------------------------------------------------------
alter table public.platform_settings
  add column autopatrocinio_amount_cents integer not null default 3990
    check (autopatrocinio_amount_cents > 0);

comment on column public.platform_settings.autopatrocinio_amount_cents is
  'Valor fixo mensal quando a própria igreja assume a mensalidade (não é por posição, como sponsor_price_tiers).';

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

-- Quantos patrocínios DE VERDADE (não autopatrocínio) estão cobráveis hoje,
-- desta igreja especificamente.
create or replace function public.church_real_billable_sponsorships(p_church_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.sponsorships s
  join public.sponsor_accounts a on a.id = s.sponsor_id
  where s.church_id = p_church_id
    and not a.is_self_payment
    and s.status in ('active', 'pending_payment');
$$;

revoke all on function public.church_real_billable_sponsorships(uuid) from public, anon, authenticated;
grant execute on function public.church_real_billable_sponsorships(uuid) to authenticated;

-- A igreja liga o autopatrocínio: cria a conta (se não existir) e o
-- patrocínio, sempre um-pra-um com ela mesma. A cobrança de verdade (criar
-- cliente/assinatura no provedor) acontece depois, no service TS — aqui só
-- garante a forma dos dados e quem pode mexer.
create or replace function public.enable_church_self_payment(
  p_church_id uuid,
  p_kind text,
  p_display_name text,
  p_email text,
  p_phone text,
  p_document text
)
returns public.sponsor_accounts
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_church public.churches%rowtype;
  v_account public.sponsor_accounts%rowtype;
  v_real integer;
begin
  select * into v_church from public.churches where id = p_church_id and deleted_at is null;
  if v_church.id is null then
    raise exception 'Igreja não encontrada.' using errcode = 'P0002';
  end if;
  if not public.is_company_admin(v_church.company_id) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  v_real := public.church_real_billable_sponsorships(p_church_id);
  if v_real > 0 then
    raise exception 'Esta igreja já tem patrocinador ativo.' using errcode = 'P0001';
  end if;

  select * into v_account
  from public.sponsor_accounts
  where church_id = p_church_id and is_self_payment and deleted_at is null;

  if v_account.id is null then
    insert into public.sponsor_accounts (
      church_id, company_id, is_self_payment, kind, display_name, email, phone, document
    )
    values (p_church_id, v_church.company_id, true, p_kind, p_display_name, p_email, p_phone, p_document)
    returning * into v_account;
  end if;

  -- Reaproveita o patrocínio existente (ex.: reativação depois que o último
  -- patrocinador saiu) em vez de duplicar; senão cria o primeiro.
  if not exists (
    select 1 from public.sponsorships
    where sponsor_id = v_account.id and church_id = v_church.id
      and status in ('pending_payment', 'active', 'cancel_scheduled')
  ) then
    insert into public.sponsorships (sponsor_id, church_id, company_id, status)
    values (v_account.id, v_church.id, v_church.company_id, 'pending_payment');
  end if;

  return v_account;
end;
$fn$;

revoke all on function public.enable_church_self_payment(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.enable_church_self_payment(uuid, text, text, text, text, text) to authenticated;

-- A igreja liga/desliga aceitar patrocinador. Fechar só é permitido sem
-- patrocinador de verdade ativo (mesma regra do autopatrocínio).
create or replace function public.set_church_aceita_patrocinio(p_church_id uuid, p_aceita boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_church public.churches%rowtype;
  v_real integer;
begin
  select * into v_church from public.churches where id = p_church_id and deleted_at is null;
  if v_church.id is null then
    raise exception 'Igreja não encontrada.' using errcode = 'P0002';
  end if;
  if not public.is_company_admin(v_church.company_id) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  if not p_aceita then
    v_real := public.church_real_billable_sponsorships(p_church_id);
    if v_real > 0 then
      raise exception 'Não dá para fechar: esta igreja já tem patrocinador ativo.' using errcode = 'P0001';
    end if;
  end if;

  update public.churches set aceita_patrocinio = p_aceita where id = p_church_id;
end;
$fn$;

revoke all on function public.set_church_aceita_patrocinio(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_church_aceita_patrocinio(uuid, boolean) to authenticated;

-- O valor do autopatrocínio precisa ser lido por quem vai OPTAR por ele,
-- antes de decidir — igual sponsor_price_tiers já é público, mas este número
-- vive em platform_settings, que não tem select nenhum liberado.
create or replace function public.get_autopatrocinio_amount_cents()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select autopatrocinio_amount_cents from public.platform_settings where id = 1;
$$;

revoke all on function public.get_autopatrocinio_amount_cents() from public, anon, authenticated;
grant execute on function public.get_autopatrocinio_amount_cents() to authenticated;
-- syncBilling (job, webhook) roda com o client de sistema (ver src/server/sponsor.ts).
grant execute on function public.get_autopatrocinio_amount_cents() to service_role;

-- Escrita: só platform_staff, registrada como as outras configurações. Campo
-- próprio (não platform_update_settings) para não mudar a assinatura de uma
-- função já publicada.
create or replace function public.platform_update_autopatrocinio_amount(p_amount_cents integer)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_antes integer;
begin
  if not public.is_platform_staff() then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'o valor precisa ser maior que zero' using errcode = 'check_violation';
  end if;

  select autopatrocinio_amount_cents into v_antes from public.platform_settings where id = 1;

  update public.platform_settings set autopatrocinio_amount_cents = p_amount_cents, updated_at = now(), updated_by = auth.uid()
  where id = 1;

  insert into public.platform_staff_actions (staff_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'platform.autopatrocinio_amount.update', 'platform_settings', null,
    jsonb_build_object('antes', v_antes, 'depois', p_amount_cents)
  );

  return p_amount_cents;
end;
$fn$;

revoke all on function public.platform_update_autopatrocinio_amount(integer) from public, anon, authenticated;
grant execute on function public.platform_update_autopatrocinio_amount(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Autopatrocínio nunca aparece como "um patrocinador" — nem na lista que a
-- igreja vê no painel, nem na vitrine pública. Redefine as duas funções só
-- para acrescentar esse filtro (resto idêntico a como já estavam).
-- ---------------------------------------------------------------------------
create or replace function public.list_company_sponsors(p_company_id uuid)
returns table (
  sponsorship_id uuid,
  church_id uuid,
  church_name text,
  sponsor_name text,
  logo_url text,
  status text,
  activated_at timestamptz,
  ends_at timestamptz,
  hidden_at timestamptz,
  denuncia_aberta boolean,
  em_carencia boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    s.id,
    s.church_id,
    public.church_full_name(c.name, c.sobrenome),
    sa.display_name,
    sa.logo_url,
    s.status,
    s.activated_at,
    s.ends_at,
    s.hidden_at,
    exists (
      select 1 from public.sponsor_abuse_reports r
      where r.sponsorship_id = s.id and r.status = 'aberta'
    ),
    public.sponsor_fora_da_vitrine(s.sponsor_id)
  from public.sponsorships s
  join public.churches c on c.id = s.church_id
  join public.sponsor_accounts sa on sa.id = s.sponsor_id
  where s.company_id = p_company_id
    and s.status in ('active', 'cancel_scheduled')
    and sa.deleted_at is null
    and not sa.is_self_payment
  order by s.activated_at desc nulls last, s.created_at desc;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Transição automática: patrocinador de verdade entra, autopatrocínio some
-- ---------------------------------------------------------------------------
-- Gatilho em vez de checagem no service: garante a regra não importa qual
-- caminho ativou a sponsorship de verdade (RPC comum, webhook via
-- activatePendingSponsorships, o que vier a existir depois). Mesma conta que
-- `cancel_sponsorship` já faz — pending_payment encerra na hora (nunca foi
-- cobrado), active agenda para o fim do ciclo já pago.
create or replace function public.handoff_self_payment_on_real_sponsor()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_self public.sponsorships%rowtype;
  v_next_due date;
begin
  if new.status not in ('pending_payment', 'active') then
    return new;
  end if;
  if exists (select 1 from public.sponsor_accounts where id = new.sponsor_id and is_self_payment) then
    return new;
  end if;

  select s.* into v_self
  from public.sponsorships s
  join public.sponsor_accounts a on a.id = s.sponsor_id
  where s.church_id = new.church_id
    and s.id <> new.id
    and a.is_self_payment
    and s.status in ('pending_payment', 'active')
  limit 1;

  if v_self.id is null then
    return new;
  end if;

  if v_self.status = 'pending_payment' then
    update public.sponsorships
    set status = 'canceled', cancel_requested_at = now(), canceled_at = now(), ends_at = now()
    where id = v_self.id;
  else
    select next_due_date into v_next_due from public.sponsor_accounts where id = v_self.sponsor_id;
    update public.sponsorships
    set status = 'cancel_scheduled', cancel_requested_at = now(),
        ends_at = coalesce(v_next_due::timestamptz, now())
    where id = v_self.id;
  end if;

  return new;
end;
$fn$;

revoke all on function public.handoff_self_payment_on_real_sponsor() from public, anon, authenticated;

drop trigger if exists handoff_self_payment_on_real_sponsor_trg on public.sponsorships;
create trigger handoff_self_payment_on_real_sponsor_trg
  after insert or update of status on public.sponsorships
  for each row
  execute function public.handoff_self_payment_on_real_sponsor();

create or replace function public.list_church_sponsors(p_church_id uuid)
returns table (
  sponsorship_id uuid,
  display_name text,
  logo_url text,
  link_tipo text,
  link_valor text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select s.id, sa.display_name, sa.logo_url, sa.link_tipo, sa.link_valor
  from public.sponsorships s
  join public.sponsor_accounts sa on sa.id = s.sponsor_id
  where s.church_id = p_church_id
    and s.status in ('active', 'cancel_scheduled')
    and sa.deleted_at is null
    and not sa.is_self_payment
    and s.hidden_at is null
    and not public.sponsor_fora_da_vitrine(s.sponsor_id)
  order by s.created_at asc, s.id asc;
$fn$;

notify pgrst, 'reload schema';
