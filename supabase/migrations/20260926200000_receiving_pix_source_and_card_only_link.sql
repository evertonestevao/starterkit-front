-- Pix da vitrine: própria (chave direta) OU pela subconta Asaas — nunca as
-- duas juntas. Ter duas opções de Pix ao mesmo tempo confunde quem doa
-- (qual usar?). O cartão continua independente: liga ou desliga, não importa
-- qual Pix está ativo.
alter table public.churches
  add column if not exists pix_fonte text not null default 'propria'
    check (pix_fonte in ('propria', 'asaas'));

comment on column public.churches.pix_fonte is
  'Qual Pix aparece na vitrine da igreja: chave própria ou o Pix da subconta Asaas. Nunca os dois.';

grant update (pix_fonte) on public.churches to authenticated;
-- A página pública lê isso pra saber se mostra a chave própria ou o botão
-- de Pix pela Asaas (anon: mesma regra das outras colunas públicas de churches).
grant select (pix_fonte) on public.churches to anon, authenticated;

-- O link antigo (link_doacao) misturava cartão e Pix no mesmo checkout
-- (billingType UNDEFINED) — e o Asaas não permite tirar só o boleto dessa
-- combinação. Vira o link só de CARTÃO; o Pix pela Asaas ganha link próprio,
-- cada um criado com billingType específico (sem boleto em nenhum dos dois).
alter table public.church_payment_accounts
  rename column link_doacao to link_doacao_cartao;

alter table public.church_payment_accounts
  add column if not exists link_doacao_pix text;

comment on column public.church_payment_accounts.link_doacao_pix is
  'Link de doação por Pix na subconta Asaas. Só usado quando churches.pix_fonte = ''asaas''.';

grant select (link_doacao_pix) on public.church_payment_accounts to authenticated;
-- link_doacao_cartao: o rename preserva o GRANT que já existia com o nome antigo.

-- Vitrine pública: cartão e Pix (Asaas) cada um com seu link, e o Pix só
-- aparece quando a igreja escolheu a fonte "asaas".
create or replace function public.church_card_donation_link(p_church_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.link_doacao_cartao
  from public.church_payment_accounts a
  join public.churches c on c.id = a.church_id and c.deleted_at is null
  where a.church_id = p_church_id
    and a.status = 'aprovada'
    and a.aceita_cartao
    and a.link_doacao_cartao is not null;
$$;

create or replace function public.church_pix_donation_link(p_church_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.link_doacao_pix
  from public.church_payment_accounts a
  join public.churches c on c.id = a.church_id and c.deleted_at is null
  where a.church_id = p_church_id
    and c.pix_fonte = 'asaas'
    and a.status = 'aprovada'
    and a.link_doacao_pix is not null;
$$;

revoke all on function public.church_pix_donation_link(uuid) from public, anon, authenticated;
-- A vitrine é pública: a página da igreja abre sem login.
grant execute on function public.church_pix_donation_link(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
