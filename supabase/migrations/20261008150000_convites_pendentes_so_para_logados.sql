-- `my_pending_invites` só para quem está logado.
--
-- A migration que criou a função tirou a permissão de `public` e deu a
-- `authenticated`, mas não tirou a de `anon`. No Supabase online, função nova
-- nasce com permissão explícita para `anon` (default privileges da
-- plataforma), e essa permissão sobrevive ao `revoke ... from public` — foi o
-- que a comparação de produção com o dev mostrou.
--
-- Não havia vazamento: sem sessão não há e-mail para casar, e a função devolve
-- vazio. Mas uma função `security definer` executável por `anon` fora da lista
-- das que a página pública usa é exatamente o que o teste de RLS proíbe.

revoke all on function public.my_pending_invites() from public, anon;
grant execute on function public.my_pending_invites() to authenticated, service_role;

notify pgrst, 'reload schema';
