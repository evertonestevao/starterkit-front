-- Incremento atômico do total da campanha, para o lado do WEBHOOK de cartão.
--
-- A confirmação PIX soma o total dentro de `confirmar_doacao_pix`, chamada
-- por quem administra (RLS confere o dono). O webhook não tem sessão de
-- usuário — roda com service_role, que já bypassa RLS —, mas ainda precisa
-- de um jeito ATÔMICO de somar (não um select+update em dois passos, que
-- teria corrida entre dois webhooks quase simultâneos). Por isso é uma
-- função só para isso, executável só por service_role.
create or replace function public.incrementar_total_campanha(p_campaign_id uuid, p_valor_cents integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.campaigns
  set total_arrecadado_liquido_cents = total_arrecadado_liquido_cents + p_valor_cents
  where id = p_campaign_id;
$$;

revoke all on function public.incrementar_total_campanha(uuid, integer) from public, anon, authenticated;
grant execute on function public.incrementar_total_campanha(uuid, integer) to service_role;

notify pgrst, 'reload schema';
