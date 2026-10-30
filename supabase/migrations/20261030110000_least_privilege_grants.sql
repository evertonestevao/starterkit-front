-- Privilégio mínimo para anon/authenticated em tudo que existe no schema public.
--
-- As migrations anteriores assumiam que tabela nova nasce sem acesso. Conforme a versão
-- do Supabase, as default privileges da role postgres dão acesso total (inclusive
-- TRUNCATE, que ignora RLS) a anon/authenticated, e a RLS ficava como única barreira.
-- Aqui os GRANTs voltam a ser a primeira camada. Nenhuma policy de RLS é alterada.
--
-- A partir desta migration, toda tabela ou função nova nasce fechada para o client:
-- declare o GRANT junto com o CREATE, na mesma migration.

-- ---------------------------------------------------------------------------
-- Tabelas: remove tudo e concede só o que o client usa.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.plans, public.terms_versions to anon;

grant select on
  public.roles,
  public.plans,
  public.terms_versions,
  public.platform_admins
to authenticated;

grant select, update on
  public.profiles,
  public.companies
to authenticated;

grant select, insert on
  public.audit_logs,
  public.terms_acceptances,
  public.user_consents
to authenticated;

grant select, insert, update on
  public.company_members,
  public.company_invites,
  public.subscriptions,
  public.settings
to authenticated;

-- service_role fica só com DML, sem TRUNCATE/REFERENCES/TRIGGER.
revoke all on all tables in schema public from service_role;
grant select, insert, update, delete on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Funções: anon não executa nenhuma; authenticated só as RPCs e os helpers de RLS.
-- Triggers não dependem de EXECUTE do usuário que dispara a escrita.
-- ---------------------------------------------------------------------------
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end $$;

grant execute on function
  public.is_company_member(uuid),
  public.is_company_admin(uuid),
  public.is_company_owner(uuid),
  public.is_super_admin(),
  public.create_company(text, text),
  public.leave_company(uuid),
  public.accept_company_invite(uuid),
  public.my_pending_invites(),
  public.transfer_company_ownership(uuid, uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Objetos futuros criados pelas migrations (role postgres) nascem fechados.
-- service_role continua com DML, como em 20260707100000_service_role_grants.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
-- EXECUTE para PUBLIC é default global do Postgres: "in schema" não consegue removê-lo.
alter default privileges for role postgres
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke all on tables from service_role;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
