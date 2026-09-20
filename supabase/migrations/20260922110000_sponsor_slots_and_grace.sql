-- ---------------------------------------------------------------------------
-- Vagas de primeiro patrocínio e carência da marca na vitrine
-- ---------------------------------------------------------------------------
-- As duas regras leem `platform_settings` (migration 20260922100000).
--
-- VAGAS: limita quantos patrocinadores podem ter a igreja como PRIMEIRA
-- (a igreja principal deles). Expansão — a 2ª, 3ª, 4ª igreja do mesmo
-- patrocinador — nunca ocupa vaga e nunca é barrada: quem já paga pode se
-- espalhar à vontade, e o limite existe só para segurar a fila de entrada.
-- Se fosse calculado na hora ("é o patrocínio mais antigo da conta?"), o
-- cancelamento do primeiro promoveria o segundo a primeiro e ele passaria a
-- ocupar vaga numa igreja sem que ninguém tenha pedido nada. Por isso a marca
-- fica GRAVADA na linha, no momento em que o patrocínio nasce.
--
-- CARÊNCIA: a marca sai da vitrine quando a conta tem cobrança vencida há
-- mais dias que o configurado. Calculado em tempo de LEITURA — mudar 15 para
-- 7 vale no acesso seguinte, sem job e sem reprocessar histórico. Pagou, a
-- cobrança deixa de estar vencida (webhook) e a marca volta sozinha.

alter table public.sponsorships
  add column if not exists primeiro boolean not null default false;

comment on column public.sponsorships.primeiro is
  'Assinatura inicial do patrocinador (a igreja principal dele). Só ela ocupa vaga.';

-- Backfill: o patrocínio mais antigo de cada conta é o primeiro dela.
with primeiros as (
  select distinct on (sponsor_id) id
  from public.sponsorships
  order by sponsor_id, created_at, id
)
update public.sponsorships s
set primeiro = true
from primeiros p
where p.id = s.id;

create index if not exists sponsorships_primeiro_idx
  on public.sponsorships (church_id)
  where primeiro and status in ('pending_payment', 'active', 'cancel_scheduled');

-- ---------------------------------------------------------------------------
-- Vagas
-- ---------------------------------------------------------------------------
-- Limite do tipo da igreja + quantas vagas já estão ocupadas. Null no limite
-- = ilimitado. Pública (a página de convite mostra "esgotado" antes de o
-- patrocinador preencher qualquer coisa).
create or replace function public.church_primeiro_slots(p_church_id uuid)
returns table (limite integer, ocupadas integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    case c.tipo
      when 'sede' then s.vagas_primeiro_sede
      when 'subsede' then s.vagas_primeiro_subsede
      else s.vagas_primeiro_congregacao
    end,
    (
      select count(*)::integer
      from public.sponsorships sp
      where sp.church_id = c.id
        and sp.primeiro
        and sp.status in ('pending_payment', 'active', 'cancel_scheduled')
    )
  from public.churches c
  cross join public.platform_settings s
  where c.id = p_church_id and c.deleted_at is null and s.id = 1;
$$;

revoke all on function public.church_primeiro_slots(uuid) from public, anon, authenticated;
grant execute on function public.church_primeiro_slots(uuid) to anon, authenticated;

-- Pedir patrocínio: agora decide se é o primeiro da conta e, sendo, confere a
-- vaga. A checagem vive AQUI (e não só no service) porque esta RPC é a única
-- porta de entrada — pelo PostgREST, um client pularia qualquer validação de
-- tela.
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
  v_primeiro boolean;
  v_slots record;
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

  -- Primeiro patrocínio = a conta ainda não tem nenhum patrocínio vivo.
  v_primeiro := not exists (
    select 1 from public.sponsorships
    where sponsor_id = v_account.id
      and status in ('pending_payment', 'active', 'cancel_scheduled')
  );

  if v_primeiro then
    select * into v_slots from public.church_primeiro_slots(p_church_id);
    if v_slots.limite is not null and v_slots.ocupadas >= v_slots.limite then
      raise exception 'as vagas de patrocinio desta igreja estao esgotadas'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.sponsorships (sponsor_id, church_id, company_id, status, activated_at, primeiro)
  values (
    v_account.id,
    p_church_id,
    v_company_id,
    case when v_account.billing_status = 'active' then 'active' else 'pending_payment' end,
    case when v_account.billing_status = 'active' then now() else null end,
    v_primeiro
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.request_sponsorship(uuid) from public, anon, authenticated;
grant execute on function public.request_sponsorship(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Carência da marca
-- ---------------------------------------------------------------------------
-- true = a conta está em atraso há mais dias que a carência configurada, e a
-- marca não aparece. Sai da vitrine sozinha e volta sozinha.
create or replace function public.sponsor_fora_da_vitrine(p_sponsor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sponsor_charges c
    cross join public.platform_settings s
    where c.sponsor_id = p_sponsor_id
      and c.status = 'overdue'
      and s.id = 1
      and c.due_date < (current_date - s.carencia_marca_dias)
  );
$$;

revoke all on function public.sponsor_fora_da_vitrine(uuid) from public, anon, authenticated;

-- A vitrine pública passa a respeitar a carência.
create or replace function public.list_church_sponsors(p_church_id uuid)
returns table (sponsorship_id uuid, display_name text, logo_url text)
language sql
stable
security definer
set search_path = public
as $fn$
  select s.id, sa.display_name, sa.logo_url
  from public.sponsorships s
  join public.sponsor_accounts sa on sa.id = s.sponsor_id
  where s.church_id = p_church_id
    and s.status in ('active', 'cancel_scheduled')
    and sa.deleted_at is null
    and s.hidden_at is null
    and not public.sponsor_fora_da_vitrine(s.sponsor_id)
  order by s.created_at asc, s.id asc;
$fn$;

revoke all on function public.list_church_sponsors(uuid) from public, anon, authenticated;
grant execute on function public.list_church_sponsors(uuid) to anon, authenticated;

-- E o painel da igreja diz por que alguém sumiu da página dela: sem isso, a
-- lista do painel afirmaria que a marca está no ar quando não está.
drop function if exists public.list_company_sponsors(uuid);
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
    c.name,
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
  order by s.activated_at desc nulls last, s.created_at desc;
end;
$fn$;

revoke all on function public.list_company_sponsors(uuid) from public, anon, authenticated;
grant execute on function public.list_company_sponsors(uuid) to authenticated;

notify pgrst, 'reload schema';
