-- Mensalidade da igreja: R$ 89,90 por padrão, com valor próprio por igreja
-- definido só pela plataforma.
--
-- Até aqui todas as igrejas pagavam o mesmo valor (`platform_settings`). A
-- plataforma precisa poder combinar um valor diferente com uma igreja — um
-- desconto, ou um valor simbólico para a igreja de teste — sem mexer no das
-- outras.
--
--   * `churches.mensalidade_centavos`: nulo = vale o padrão. Sem GRANT de
--     UPDATE: nem quem administra a igreja escreve o próprio preço. Só a
--     função `platform_definir_mensalidade`, da moderação, com registro em
--     `platform_staff_actions`.
--   * `mensalidade_da_igreja(church_id)`: o valor que vale para a igreja. É o
--     único lugar que resolve "próprio ou padrão"; a cobrança lê daqui.
--
-- Mínimo de R$ 5,00: abaixo disso o provedor de pagamento não emite cobrança.

-- O padrão passa a R$ 89,90.
alter table public.platform_settings alter column autopatrocinio_amount_cents set default 8990;
update public.platform_settings set autopatrocinio_amount_cents = 8990 where id = 1;

alter table public.churches
  add column if not exists mensalidade_centavos integer
    check (mensalidade_centavos is null or mensalidade_centavos between 500 and 1000000),
  add column if not exists mensalidade_motivo text
    check (mensalidade_motivo is null or char_length(mensalidade_motivo) <= 200);

comment on column public.churches.mensalidade_centavos is
  'Mensalidade combinada com esta igreja, em centavos. Nulo = padrão da plataforma. Só a moderação altera.';

-- O valor que vale para a igreja.
create or replace function public.mensalidade_da_igreja(p_church_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.mensalidade_centavos from public.churches c where c.id = p_church_id and c.deleted_at is null),
    (select s.autopatrocinio_amount_cents from public.platform_settings s where s.id = 1)
  );
$$;

revoke all on function public.mensalidade_da_igreja(uuid) from public, anon, authenticated;
-- Quem está logado vê o preço (é o que a tela da mensalidade mostra); o
-- servidor lê para cobrar.
grant execute on function public.mensalidade_da_igreja(uuid) to authenticated, service_role;

-- A moderação define (ou tira, com nulo) o valor próprio de uma igreja.
-- Devolve a conta de cobrança da igreja, se ela já paga, para o servidor
-- atualizar o valor no provedor de pagamento.
create or replace function public.platform_definir_mensalidade(
  p_church_id uuid,
  p_amount_cents integer,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_igreja public.churches%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_conta uuid;
begin
  if not public.is_platform_staff() then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  select * into v_igreja from public.churches where id = p_church_id and deleted_at is null for update;
  if v_igreja.id is null then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;
  if p_amount_cents is not null and (p_amount_cents < 500 or p_amount_cents > 1000000) then
    raise exception 'valor fora do permitido' using errcode = '23514';
  end if;
  -- Valor diferente do padrão pede o porquê: é o que fica para quem conferir depois.
  if p_amount_cents is not null and v_motivo is null then
    raise exception 'informe o motivo' using errcode = '22023';
  end if;

  update public.churches
     set mensalidade_centavos = p_amount_cents,
         mensalidade_motivo = case when p_amount_cents is null then null else left(v_motivo, 200) end
   where id = p_church_id;

  insert into public.platform_staff_actions (staff_user_id, action, entity_type, entity_id, via, metadata)
  values (
    auth.uid(), 'church.mensalidade.definida', 'church', p_church_id, 'painel',
    jsonb_build_object('antes', v_igreja.mensalidade_centavos, 'depois', p_amount_cents, 'motivo', v_motivo)
  );

  select a.id into v_conta
  from public.sponsor_accounts a
  where a.church_id = p_church_id and a.is_self_payment and a.deleted_at is null;
  return v_conta;
end;
$$;

-- O que a tela da plataforma precisa, por igreja: o valor próprio (se houver),
-- o padrão e se a igreja já está pagando.
create or replace function public.platform_mensalidades()
returns table (church_id uuid, valor_proprio integer, motivo text, valor_padrao integer, pagando boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.mensalidade_centavos, c.mensalidade_motivo,
         (select s.autopatrocinio_amount_cents from public.platform_settings s where s.id = 1),
         exists (
           select 1
           from public.sponsor_accounts a
           join public.sponsorships sp on sp.sponsor_id = a.id and sp.church_id = c.id
           where a.church_id = c.id and a.is_self_payment and a.deleted_at is null
             and sp.status in ('pending_payment', 'active')
         )
  from public.churches c
  where public.is_platform_staff() and c.deleted_at is null;
$$;

-- A fatura em aberto da mensalidade (o endereço da página de pagamento com
-- cartão, no provedor), para a igreja pagar sem depender do e-mail. As
-- cobranças só são legíveis pelo dono da conta de cobrança; quem administra a
-- igreja lê por aqui, e só a fatura da PRÓPRIA igreja.
create or replace function public.mensalidade_fatura_aberta(p_church_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ch.invoice_url
  from public.churches c
  join public.sponsor_accounts a on a.church_id = c.id and a.is_self_payment and a.deleted_at is null
  join public.sponsor_charges ch on ch.sponsor_id = a.id
  where c.id = p_church_id
    and c.deleted_at is null
    and c.company_id is not null
    and public.is_company_admin(c.company_id)
    and ch.status in ('pending', 'overdue')
    and ch.invoice_url is not null
  order by ch.due_date desc
  limit 1;
$$;

revoke all on function public.mensalidade_fatura_aberta(uuid) from public, anon, authenticated;
grant execute on function public.mensalidade_fatura_aberta(uuid) to authenticated;

revoke all on function public.platform_definir_mensalidade(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.platform_mensalidades() from public, anon, authenticated;
grant execute on function public.platform_definir_mensalidade(uuid, integer, text) to authenticated;
grant execute on function public.platform_mensalidades() to authenticated;

notify pgrst, 'reload schema';
