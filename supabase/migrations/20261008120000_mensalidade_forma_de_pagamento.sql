-- Mensalidade: forma de pagamento (cartão ou Pix Automático).
--
-- A mensalidade da igreja era só no cartão. Passa a existir a escolha entre
-- as duas formas que cobram sozinhas depois da primeira vez: cartão de
-- crédito e Pix Automático (a igreja autoriza uma vez no aplicativo do banco).
--
-- Aqui fica só o que é do banco: qual forma a conta usa e a autorização do
-- Pix no provedor. Quem fala com o provedor é o servidor (`service_role`); a
-- igreja escolhe a forma pela função abaixo, e só enquanto não há uma
-- cobrança recorrente viva — trocar com ela correndo deixaria duas cobranças.

alter table public.sponsor_accounts
  add column if not exists payment_method text not null default 'card'
    check (payment_method in ('card', 'pix_automatico')),
  -- Autorização do Pix Automático no provedor (a assinatura ligada a ela fica
  -- em gateway_subscription_id, como no cartão).
  add column if not exists gateway_authorization_id text;

comment on column public.sponsor_accounts.payment_method is
  'Como a recorrência é cobrada: cartão de crédito ou Pix Automático.';

-- `sponsor_accounts` só tem GRANT de UPDATE em `visible_on_page`: as duas
-- colunas novas não são escritas pelo dono da conta nem pela igreja.

create or replace function public.definir_forma_mensalidade(p_church_id uuid, p_forma text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_conta public.sponsor_accounts%rowtype;
begin
  select company_id into v_company from public.churches where id = p_church_id and deleted_at is null;
  -- Mesma resposta para "não existe" e "não é sua".
  if v_company is null or not public.is_company_admin(v_company) then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;
  if p_forma is null or p_forma not in ('card', 'pix_automatico') then
    raise exception 'forma de pagamento desconhecida' using errcode = '22023';
  end if;

  select * into v_conta
  from public.sponsor_accounts
  where church_id = p_church_id and is_self_payment and deleted_at is null
  for update;
  if v_conta.id is null then
    raise exception 'cadastre o pagamento primeiro' using errcode = 'P0002';
  end if;
  if v_conta.payment_method is distinct from p_forma and v_conta.gateway_subscription_id is not null then
    raise exception 'já existe uma cobrança recorrente nesta forma de pagamento' using errcode = 'P0001';
  end if;

  update public.sponsor_accounts set payment_method = p_forma, updated_at = now() where id = v_conta.id;
  return v_conta.id;
end;
$$;

revoke all on function public.definir_forma_mensalidade(uuid, text) from public, anon, authenticated;
grant execute on function public.definir_forma_mensalidade(uuid, text) to authenticated;

notify pgrst, 'reload schema';
