-- ---------------------------------------------------------------------------
-- Recebimento por cartão: subconta da igreja no provedor
-- ---------------------------------------------------------------------------
-- Dois caminhos, e a igreja escolhe:
--
--   1. Só PIX (o padrão, e o que já existe): a igreja cadastra a chave dela,
--      a página mostra chave e QR Code, e a doação vai do banco de quem doa
--      direto para o da igreja. A plataforma não vê valor nenhum.
--
--   2. Cadastro completo (OPCIONAL): a igreja manda os dados, a plataforma
--      abre uma SUBCONTA no provedor em nome dela e, quando o provedor
--      aprovar, a igreja pode ligar o cartão na página.
--
-- O dinheiro do cartão cai na SUBCONTA DA IGREJA. Não passa pela conta da
-- plataforma, não há split e não há taxa nossa — é o mesmo compromisso do
-- PIX, com um intermediário a mais que é o provedor.
--
-- O QUE A IGREJA ESCREVE: os dados do cadastro e a escolha de aceitar cartão.
-- O QUE SÓ O SERVIDOR ESCREVE: status da subconta, ids do provedor, a chave
-- de API da subconta (cifrada) e o link de doação. Por isso os GRANTs abaixo
-- são por COLUNA: sem isso, um admin marcaria a própria subconta como
-- "aprovada" pelo PostgREST e ligaria o cartão sem o provedor ter visto nada.

create type public.church_receiving_status as enum (
  'nao_iniciado',   -- a igreja ainda não pediu
  'pendente_envio', -- dados preenchidos, subconta ainda não criada
  'em_analise',     -- provedor recebeu e está analisando
  'aprovada',       -- pode receber
  'recusada',
  'suspensa'
);

create table if not exists public.church_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,

  -- Dados do cadastro, como a igreja preencheu. Ficam aqui porque o provedor
  -- pode pedir reenvio, e refazer o formulário do zero a cada recusa é o
  -- jeito mais rápido de a igreja desistir.
  razao_social text check (razao_social is null or char_length(razao_social) between 3 and 140),
  -- Só dígitos: CPF (11) ou CNPJ (14).
  documento text check (documento is null or documento ~ '^([0-9]{11}|[0-9]{14})$'),
  email text,
  telefone text,
  cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  endereco text,
  endereco_numero text,
  bairro text,
  cidade text,
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  -- Data de nascimento do responsável: o provedor exige para conta de pessoa.
  nascimento date,

  -- Preenchido pelo servidor.
  provider text,
  status public.church_receiving_status not null default 'nao_iniciado',
  external_account_id text,
  external_wallet_id text,
  /**
   * Chave de API da SUBCONTA, cifrada na aplicação (AES-256-GCM) antes de
   * chegar aqui. O provedor devolve essa chave UMA vez, na criação, e é com
   * ela que as cobranças nascem dentro da subconta — ou seja, ela movimenta
   * dinheiro. Nem `authenticated` tem GRANT de leitura nesta coluna, e o
   * banco nunca vê o valor em claro.
   */
  api_key_cifrada text,
  /** Token que o provedor devolve nos webhooks desta igreja (hash, nunca o texto). */
  webhook_token_hash text,
  /** Link de doação por cartão, criado no provedor e reaproveitado. */
  link_doacao text,
  motivo_recusa text,
  -- A igreja liga e desliga o cartão na página; só vale com status aprovada.
  aceita_cartao boolean not null default false,
  enviado_em timestamptz,
  aprovado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.church_payment_accounts is
  'Subconta da igreja no provedor de pagamento. O dinheiro do cartão cai nela, nunca na plataforma.';

create unique index if not exists church_payment_accounts_church_idx
  on public.church_payment_accounts (church_id);

drop trigger if exists set_church_payment_accounts_company_id on public.church_payment_accounts;
create trigger set_church_payment_accounts_company_id
  before insert or update of church_id on public.church_payment_accounts
  for each row execute function public.set_company_id_from_church();

drop trigger if exists set_church_payment_accounts_updated_at on public.church_payment_accounts;
create trigger set_church_payment_accounts_updated_at
  before update on public.church_payment_accounts
  for each row execute function public.set_updated_at();

alter table public.church_payment_accounts enable row level security;
revoke all on public.church_payment_accounts from anon, authenticated;

-- Leitura sem os segredos: a lista de colunas exclui a chave de API e o hash
-- do token do webhook.
grant select (
  id, church_id, company_id, razao_social, documento, email, telefone, cep,
  endereco, endereco_numero, bairro, cidade, uf, nascimento, provider, status,
  external_account_id, link_doacao, motivo_recusa, aceita_cartao, enviado_em,
  aprovado_em, created_at, updated_at
) on public.church_payment_accounts to authenticated;

grant insert (
  church_id, razao_social, documento, email, telefone, cep, endereco,
  endereco_numero, bairro, cidade, uf, nascimento
) on public.church_payment_accounts to authenticated;

-- `aceita_cartao` entra na escrita da igreja: ligar e desligar o botão da
-- página é decisão dela. `status` NÃO entra — quem aprova é o provedor.
grant update (
  razao_social, documento, email, telefone, cep, endereco, endereco_numero,
  bairro, cidade, uf, nascimento, aceita_cartao
) on public.church_payment_accounts to authenticated;

create policy "church_payment_accounts_select_admin"
  on public.church_payment_accounts for select
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id));

create policy "church_payment_accounts_insert_admin"
  on public.church_payment_accounts for insert
  to authenticated
  with check (
    exists (
      select 1 from public.churches c
      where c.id = church_id and public.is_company_admin(c.company_id)
    )
  );

create policy "church_payment_accounts_update_admin"
  on public.church_payment_accounts for update
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id))
  with check (company_id is not null and public.is_company_admin(company_id));

grant select, insert, update on public.church_payment_accounts to service_role;

-- ---------------------------------------------------------------------------
-- Doações recebidas pela subconta
-- ---------------------------------------------------------------------------
-- Só o que a igreja precisa para conferir: quanto, quando e em que situação.
-- NADA sobre quem doou — nome, email e documento de quem doa ficam no
-- provedor, que é quem tem relação com essa pessoa. A plataforma não precisa
-- dessa lista para nada, e guardá-la seria assumir um risco de vazamento em
-- troca de conveniência.
create table if not exists public.church_donations (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  provider text not null,
  external_payment_id text not null,
  amount_cents integer not null check (amount_cents > 0),
  -- Como a pessoa pagou, quando o provedor informa.
  metodo text check (metodo in ('cartao', 'pix', 'boleto', 'outro')),
  status text not null check (status in ('pendente', 'recebida', 'estornada', 'cancelada')),
  paga_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Idempotência do webhook: reentrega do mesmo pagamento não duplica linha.
  constraint church_donations_provider_payment_key unique (provider, external_payment_id)
);

comment on table public.church_donations is
  'Doações recebidas na subconta da igreja. Sem dado de quem doou.';

create index if not exists church_donations_church_idx
  on public.church_donations (church_id, created_at desc);

drop trigger if exists set_church_donations_company_id on public.church_donations;
create trigger set_church_donations_company_id
  before insert or update of church_id on public.church_donations
  for each row execute function public.set_company_id_from_church();

drop trigger if exists set_church_donations_updated_at on public.church_donations;
create trigger set_church_donations_updated_at
  before update on public.church_donations
  for each row execute function public.set_updated_at();

alter table public.church_donations enable row level security;
revoke all on public.church_donations from anon, authenticated;

-- A igreja lê as próprias doações; quem está acima na árvore também (mesma
-- regra dos outros dados de igreja). Escrita é só do webhook.
grant select on public.church_donations to authenticated;
create policy "church_donations_select_tree"
  on public.church_donations for select
  to authenticated
  using (public.can_view_church(church_id));

grant select, insert, update on public.church_donations to service_role;

-- ---------------------------------------------------------------------------
-- Leitura pública: a página precisa saber se mostra o botão do cartão
-- ---------------------------------------------------------------------------
-- Devolve só o que a página usa. `anon` não chega perto da tabela: a
-- subconta tem documento, endereço e segredos.
create or replace function public.church_card_donation_link(p_church_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.link_doacao
  from public.church_payment_accounts a
  join public.churches c on c.id = a.church_id and c.deleted_at is null
  where a.church_id = p_church_id
    and a.status = 'aprovada'
    and a.aceita_cartao
    and a.link_doacao is not null;
$$;

revoke all on function public.church_card_donation_link(uuid) from public, anon, authenticated;
grant execute on function public.church_card_donation_link(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
