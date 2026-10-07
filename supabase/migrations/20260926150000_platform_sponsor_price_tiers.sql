-- ---------------------------------------------------------------------------
-- Preço de patrocínio editável pela moderação da plataforma
-- ---------------------------------------------------------------------------
-- `sponsor_price_tiers` já é pública para LEITURA (o patrocinador vê o preço
-- antes de assinar — ver 20260917120000_sponsorships.sql). Falta só a
-- escrita, e como CLAUDE.md pede: sem GRANT de update/insert/delete para
-- authenticated, tudo pela RPC abaixo.
--
-- É uma LISTA (posição 1..N), não uma linha só: trocar tier a tier deixaria
-- buracos ou posições fora de ordem enquanto o formulário salva em partes.
-- Por isso a RPC recebe a tabela INTEIRA de uma vez e substitui tudo dentro
-- da mesma transação (truncate + insert no corpo da função é atômico com a
-- chamada). Não há FK apontando para `sponsor_price_tiers`: a cobrança já
-- gravada guarda o valor como snapshot, então mudar o preço aqui nunca
-- reescreve uma cobrança do passado.

create or replace function public.platform_update_sponsor_price_tiers(p_tiers jsonb)
returns setof public.sponsor_price_tiers
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_antes jsonb;
  v_fora_de_ordem integer;
  v_invalido integer;
begin
  if not public.is_platform_staff() then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(p_tiers) is distinct from 'array' or jsonb_array_length(p_tiers) = 0 then
    raise exception 'informe ao menos uma posicao' using errcode = 'check_violation';
  end if;

  -- Posições 1..N contíguas, na ordem: é o que "a última posição vale para
  -- as seguintes" pressupõe — um buraco deixaria uma posição sem preço.
  select count(*) into v_fora_de_ordem
  from jsonb_array_elements(p_tiers) with ordinality as t(item, ord)
  where (item->>'position')::integer is distinct from ord::integer;
  if v_fora_de_ordem > 0 then
    raise exception 'as posicoes precisam ser 1, 2, 3... sem pular nem repetir' using errcode = 'check_violation';
  end if;

  select count(*) into v_invalido
  from jsonb_array_elements(p_tiers) as item
  where coalesce((item->>'amount_cents')::integer, 0) <= 0;
  if v_invalido > 0 then
    raise exception 'todo valor precisa ser maior que zero' using errcode = 'check_violation';
  end if;

  select jsonb_agg(jsonb_build_object('position', position, 'amount_cents', amount_cents) order by position)
  into v_antes
  from public.sponsor_price_tiers;

  -- `delete from ... ;` sem WHERE é bloqueado pelo `plan_filter` do Supabase
  -- (protege contra apagar tabela inteira sem querer). TRUNCATE não passa
  -- por esse filtro e, como não há FK apontando para esta tabela, é seguro.
  truncate public.sponsor_price_tiers;

  insert into public.sponsor_price_tiers (position, amount_cents)
  select (item->>'position')::integer, (item->>'amount_cents')::integer
  from jsonb_array_elements(p_tiers) as item;

  insert into public.platform_staff_actions (staff_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'platform.sponsor_price_tiers.update',
    'sponsor_price_tiers',
    null,
    jsonb_build_object('antes', coalesce(v_antes, '[]'::jsonb), 'depois', p_tiers)
  );

  return query select * from public.sponsor_price_tiers order by position;
end;
$fn$;

revoke all on function public.platform_update_sponsor_price_tiers(jsonb) from public, anon, authenticated;
grant execute on function public.platform_update_sponsor_price_tiers(jsonb) to authenticated;

notify pgrst, 'reload schema';
