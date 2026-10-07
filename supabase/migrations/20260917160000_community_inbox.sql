-- A igreja passa a LER o que a comunidade envia.
--
-- O buraco: a página pública já gravava pedidos de oração, inscrições em
-- eventos e visitantes, mas as três tabelas tinham SÓ policy de INSERT.
-- Ninguém conseguia ler — nem o dono da igreja. Dado entrava e sumia, e o
-- painel mostrava números inventados no código.
--
-- Duas decisões desta migration:
--
-- 1. `company_id` denormalizado (regra do CLAUDE.md para tabela de negócio) e
--    preenchido por TRIGGER, nunca pelo cliente. O insert vem de formulário
--    ANÔNIMO: aceitar company_id do corpo deixaria qualquer um carimbar o
--    registro na empresa errada.
-- 2. Leitura liberada para MEMBRO da empresa (não só admin), porque quem
--    atende pedido de oração e recebe visitante costuma ser a equipe de
--    ministério, e o menu já expõe essas telas a member. Se quiser apertar
--    para admin, troque is_company_member por is_company_admin aqui.

-- ---------------------------------------------------------------------------
-- company_id (denormalizado da igreja) + trigger que o preenche
-- ---------------------------------------------------------------------------
alter table public.prayer_requests add column company_id uuid references public.companies (id) on delete cascade;
alter table public.event_signups  add column company_id uuid references public.companies (id) on delete cascade;
alter table public.visitors       add column company_id uuid references public.companies (id) on delete cascade;

create or replace function public.set_company_id_from_church()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ignora o que veio do cliente: a fonte é sempre a igreja referenciada.
  select c.company_id into new.company_id
  from public.churches c
  where c.id = new.church_id;

  return new;
end;
$$;

create trigger set_prayer_requests_company_id
  before insert or update of church_id on public.prayer_requests
  for each row execute function public.set_company_id_from_church();

create trigger set_event_signups_company_id
  before insert or update of church_id on public.event_signups
  for each row execute function public.set_company_id_from_church();

create trigger set_visitors_company_id
  before insert or update of church_id on public.visitors
  for each row execute function public.set_company_id_from_church();

-- Linhas que já existiam (igrejas de demonstração ficam com company_id nulo,
-- e simplesmente não aparecem para ninguém).
update public.prayer_requests p set company_id = c.company_id from public.churches c where c.id = p.church_id;
update public.event_signups  e set company_id = c.company_id from public.churches c where c.id = e.church_id;
update public.visitors       v set company_id = c.company_id from public.churches c where c.id = v.church_id;

create index prayer_requests_company_idx on public.prayer_requests (company_id, created_at desc);
create index event_signups_company_idx   on public.event_signups (company_id, created_at desc);
create index visitors_company_idx        on public.visitors (company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Leitura pela equipe da igreja
-- ---------------------------------------------------------------------------
-- REVOKE ALL primeiro: no Supabase a tabela nasceu com ALL para anon e
-- authenticated (default privileges da plataforma). Sem isso, `anon` teria
-- DELETE e UPDATE nestas tabelas — hoje só a ausência de policy o impede.
revoke all on public.prayer_requests from anon, authenticated;
revoke all on public.event_signups from anon, authenticated;
revoke all on public.visitors from anon, authenticated;

-- O formulário público continua escrevendo; ninguém apaga nem edita.
grant insert on public.prayer_requests to anon, authenticated;
grant insert on public.event_signups to anon, authenticated;
grant insert on public.visitors to anon, authenticated;
grant select on public.prayer_requests to authenticated;
grant select on public.event_signups to authenticated;
grant select on public.visitors to authenticated;

create policy "prayer_requests_select_company"
  on public.prayer_requests for select
  to authenticated
  using (company_id is not null and public.is_company_member(company_id));

create policy "event_signups_select_company"
  on public.event_signups for select
  to authenticated
  using (company_id is not null and public.is_company_member(company_id));

create policy "visitors_select_company"
  on public.visitors for select
  to authenticated
  using (company_id is not null and public.is_company_member(company_id));

-- Sem policy de UPDATE/DELETE: o que a comunidade enviou é registro
-- histórico, não se edita nem se apaga pela aplicação.
