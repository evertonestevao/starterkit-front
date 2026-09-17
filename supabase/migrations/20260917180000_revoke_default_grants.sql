-- Fecha os privilégios que o Supabase concede sozinho.
--
-- O PROBLEMA: no Supabase, tabela criada em `public` nasce com ALL para
-- `anon` e `authenticated` (default privileges da plataforma). As migrations
-- deste projeto só ADICIONAVAM grants, assumindo que "não conceder" bastava.
-- Não basta: as 14 tabelas abaixo estavam com DELETE, UPDATE, TRUNCATE e
-- INSERT liberados para qualquer visitante anônimo.
--
-- O QUE ISSO SIGNIFICAVA NA PRÁTICA: os dados NÃO estavam expostos, porque a
-- RLS decide linha a linha e sem policy nada passa. Mas toda restrição que
-- dependia da ausência de privilégio era ilusória — `audit_logs` e
-- `terms_acceptances`, por exemplo, deveriam ser imutáveis para o cliente, e
-- só a falta de policy de UPDATE as protegia. Defesa em profundidade: se um
-- dia alguém criar uma policy permissiva demais, o GRANT não deve estar lá
-- esperando para completar o estrago.
--
-- O conjunto reconcedido abaixo é EXATAMENTE o que cada migration original
-- declarou. Nada de novo é liberado aqui.

-- ---------------------------------------------------------------------------
-- Catálogos públicos (leitura para visitante anônimo)
-- ---------------------------------------------------------------------------
revoke all on public.plans from anon, authenticated;
grant select on public.plans to anon, authenticated;

revoke all on public.templates from anon, authenticated;
grant select on public.templates to anon, authenticated;

revoke all on public.terms_versions from anon, authenticated;
grant select on public.terms_versions to anon, authenticated;

revoke all on public.roles from anon, authenticated;
grant select on public.roles to authenticated;

-- ---------------------------------------------------------------------------
-- Tenant: empresa, membros e convites
-- ---------------------------------------------------------------------------
-- Sem INSERT em companies: empresa só nasce por RPC (create_company_with_church),
-- que garante owner e igreja junto. Sem DELETE: a exclusão é soft.
revoke all on public.companies from anon, authenticated;
grant select, update on public.companies to authenticated;

revoke all on public.company_members from anon, authenticated;
grant select, insert, update on public.company_members to authenticated;

revoke all on public.company_invites from anon, authenticated;
grant select, insert, update on public.company_invites to authenticated;

revoke all on public.settings from anon, authenticated;
grant select, insert, update on public.settings to authenticated;

revoke all on public.subscriptions from anon, authenticated;
grant select, insert, update on public.subscriptions to authenticated;

revoke all on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Registros que NÃO se editam (append-only)
-- ---------------------------------------------------------------------------
-- Aqui está o ganho mais concreto: sem UPDATE/DELETE no GRANT, a
-- imutabilidade destas tabelas deixa de depender de "não existir policy".
revoke all on public.audit_logs from anon, authenticated;
grant select, insert on public.audit_logs to authenticated;

revoke all on public.terms_acceptances from anon, authenticated;
grant select, insert on public.terms_acceptances to authenticated;

revoke all on public.user_consents from anon, authenticated;
grant select, insert on public.user_consents to authenticated;

-- ---------------------------------------------------------------------------
-- Igrejas (mantém o recorte por COLUNA feito na migration de domínio)
-- ---------------------------------------------------------------------------
-- O REVOKE ALL apaga também os grants por coluna, então eles são
-- reconcedidos aqui na íntegra: anon não lê status de domínio nem a flag de
-- suporte pago, e authenticated não escreve nenhuma coluna de domínio (isso
-- só acontece pelas RPCs security definer).
revoke all on public.churches from anon, authenticated;

grant select (
  id, parent_id, name, slug, logo_url, address, service_times, social_links,
  path, template_mode, template_id, public_code, created_at, updated_at
) on public.churches to anon;

grant select on public.churches to authenticated;
grant insert on public.churches to authenticated;
grant update (
  name, logo_url, address, service_times, social_links,
  template_mode, template_id, deleted_at
) on public.churches to authenticated;

-- ---------------------------------------------------------------------------
-- Tabelas FUTURAS nascem fechadas
-- ---------------------------------------------------------------------------
-- Sem isto, a próxima migration repete o problema: quem esquecer o REVOKE
-- ganha ALL para anon de novo. Migrations passam a declarar explicitamente o
-- que liberam — que é como o resto deste projeto já funciona.
-- (Consequência: tabela criada pelo painel do Supabase nasce sem acesso pela
-- API. O CLAUDE.md já proíbe editar schema por lá, então isso é coerente.)
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
