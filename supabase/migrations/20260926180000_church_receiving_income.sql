-- Renda/faturamento mensal: campo obrigatório do Asaas pra abrir subconta
-- (POST /v3/accounts recusa com "É necessário informar a renda/faturamento"
-- sem ele). Descoberto testando direto no sandbox — não estava documentado
-- como bloqueante até então.

alter table public.church_payment_accounts
  add column if not exists renda_mensal_cents integer
    check (renda_mensal_cents is null or renda_mensal_cents > 0);

comment on column public.church_payment_accounts.renda_mensal_cents is
  'Renda/faturamento mensal informado pela igreja. Exigido pelo Asaas para abrir a subconta.';

grant insert (renda_mensal_cents) on public.church_payment_accounts to authenticated;
grant update (renda_mensal_cents) on public.church_payment_accounts to authenticated;

notify pgrst, 'reload schema';
