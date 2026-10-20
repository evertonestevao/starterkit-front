-- ---------------------------------------------------------------------------
-- `service_role` também precisa consultar as vagas
-- ---------------------------------------------------------------------------
-- O `revoke all ... from public` da migration 20260922110000 tirou o EXECUTE
-- de todo mundo, e só anon e authenticated foram reconcedidos. Acontece que a
-- assinatura PÚBLICA de patrocínio (sem login) roda com `service_role`: ela
-- cria usuário e cliente no gateway, e por isso confere a vaga ANTES disso.
-- Sem este grant, a página de assinatura respondia 500.
--
-- Lembrete para as próximas RPCs: `revoke all from public` também alcança
-- `service_role`. Toda função chamada pelo servidor precisa do grant dela.
grant execute on function public.church_primeiro_slots(uuid) to service_role;

notify pgrst, 'reload schema';
