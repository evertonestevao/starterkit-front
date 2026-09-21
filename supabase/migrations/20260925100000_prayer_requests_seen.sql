-- ---------------------------------------------------------------------------
-- Pedido de oração: "até onde eu já vi", para o badge de não visualizados
-- ---------------------------------------------------------------------------
-- Um pedido novo devia acender um sinal na sidebar, não só aparecer numa
-- lista que ninguém é avisado para abrir. O contador é POR PESSOA (não
-- compartilhado entre quem administra a empresa): se o pastor já abriu a
-- caixa de pedidos, isso não pode zerar o contador do vice-pastor, que ainda
-- não olhou o próprio.
--
-- Guarda só "até quando eu já vi" (um timestamp), não uma marca por pedido:
-- é a mesma informação, mais barata de manter, e "entrar na tela marca tudo
-- como visto" é exatamente o comportamento pedido.

create table public.prayer_requests_last_seen (
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

comment on table public.prayer_requests_last_seen is
  'Até quando cada pessoa já viu os pedidos de oração da empresa. Alimenta o badge da sidebar.';

alter table public.prayer_requests_last_seen enable row level security;

-- Tabela nova em `public` nasce com ALL para anon/authenticated (default
-- privileges da plataforma) — revoga antes de conceder o que de fato vale.
-- Só SELECT: a escrita é exclusiva da RPC abaixo (ver o motivo lá).
revoke all on public.prayer_requests_last_seen from anon, authenticated;
grant select on public.prayer_requests_last_seen to authenticated;

-- SELECT: só a própria marca. Não precisa checar papel aqui — ler "quando EU
-- vi" não expõe nada sobre o pedido em si.
create policy "prayer_requests_last_seen_select_own"
  on public.prayer_requests_last_seen for select
  to authenticated
  using (user_id = auth.uid());

-- Sem policy de INSERT/UPDATE/DELETE: a única escrita é a RPC abaixo.

-- ---------------------------------------------------------------------------
-- Escrita: RPC em vez de GRANT direto de insert/update
-- ---------------------------------------------------------------------------
-- Dois motivos para não liberar INSERT/UPDATE direto na tabela, mesmo com
-- "with check (user_id = auth.uid())":
--
--   1. Duas abas abertas (ou o clique disparando duas vezes) não podem fazer
--      a marca ANDAR PARA TRÁS. Um upsert comum sobrescreve `seen_at` com o
--      que veio por último, e a aba mais lenta regrediria a marca — os
--      pedidos que a outra aba já tinha visto voltariam a contar como novos.
--      A RPC funde com GREATEST, então só andar para frente é possível.
--   2. `auth.uid()` roda DENTRO da função: o client não informa de quem é a
--      marca, então não existe "vou gravar como se eu fosse outro usuário"
--      para checar.
create or replace function public.mark_prayer_requests_seen(p_company_id uuid, p_seen_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Mesma regra de quem lê o TEXTO do pedido: marcar "visto" para quem nem
  -- acessa a tela não faz sentido.
  if not public.is_company_admin(p_company_id) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  insert into public.prayer_requests_last_seen (user_id, company_id, seen_at)
  values (auth.uid(), p_company_id, p_seen_at)
  on conflict (user_id, company_id) do update
    set seen_at = greatest(public.prayer_requests_last_seen.seen_at, excluded.seen_at);
end;
$$;

revoke all on function public.mark_prayer_requests_seen(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_prayer_requests_seen(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
