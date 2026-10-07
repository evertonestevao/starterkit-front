-- Funções que só fazem sentido para quem está logado deixam de ser
-- executáveis por visitante (anon).
--
-- No Postgres toda função nasce executável por PUBLIC. Estas seis já se
-- protegiam por dentro (dependem de auth.uid() ou conferem is_company_admin),
-- então não havia brecha conhecida — mas "falha lá dentro" é uma defesa só.
-- Tirar o EXECUTE do anon faz o pedido sem login parar na porta, antes de
-- rodar qualquer linha, e evita que uma mudança futura no corpo de uma delas
-- abra algo sem ninguém perceber.
--
-- `service_role` recebe o GRANT explícito porque o REVOKE de PUBLIC também o
-- tira dele, e o job de verificação de domínio roda com essa chave.

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.accept_company_invite(uuid)',
    'public.claim_church_domain(uuid, text)',
    'public.clear_church_domain(uuid)',
    'public.create_company(text, text)',
    'public.leave_company(uuid)',
    'public.set_church_domain_verification(uuid, jsonb, public.church_domain_status)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
