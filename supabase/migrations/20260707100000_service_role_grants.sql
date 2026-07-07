-- GRANTs para service_role — bug encontrado na validação com Stripe real.
--
-- As migrations anteriores deram GRANT a anon/authenticated, mas NUNCA ao
-- service_role: tabelas criadas pela role "postgres" não dão privilégio
-- automático a ele (mesma armadilha documentada em profiles). service_role
-- IGNORA RLS, porém GRANT é outra camada — sem ele, o webhook de pagamento
-- falhava com "permission denied for table subscriptions" (42501).
--
-- service_role é exclusivo de código de servidor confiável (src/server),
-- então recebe DML completo — o padrão da plataforma Supabase. A
-- imutabilidade de audit_logs/terms_acceptances segue valendo para as
-- roles de CLIENT (anon/authenticated), que continuam sem esses GRANTs.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Tabelas/sequências criadas por migrations FUTURAS (rodam como postgres)
-- já nascem com os grants — ninguém precisa lembrar disso de novo.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
