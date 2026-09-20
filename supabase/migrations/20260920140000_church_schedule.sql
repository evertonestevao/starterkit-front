-- ---------------------------------------------------------------------------
-- Programação da igreja: o dia a dia, separado de Eventos
-- ---------------------------------------------------------------------------
-- Eventos (church_events) é o que tem inscrição e/ou pagamento. A programação
-- é o que a igreja faz sempre — culto de domingo, estudo de quarta — e os
-- cultos especiais avulsos. Nada aqui tem inscrição: é só "quando e onde".
--
-- Dois tipos:
--   semanal  — repete toda semana no mesmo dia e hora (dia_semana 0 = domingo)
--   especial — acontece numa data só (culto de Santa Ceia, culto da família)
--
-- Substitui aos poucos `churches.service_times` (jsonb de texto livre, sem
-- nome de culto e impossível de ordenar por hora). A página pública só usa
-- o antigo quando a igreja ainda não tem nenhum item aqui.

create table if not exists public.church_schedule (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 2 and 80),
  tipo text not null check (tipo in ('semanal', 'especial')),
  dia_semana smallint check (dia_semana between 0 and 6),
  data date,
  hora time not null,
  descricao text check (descricao is null or char_length(descricao) <= 500),
  local text check (local is null or char_length(local) <= 200),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint church_schedule_tipo_coerente check (
    (tipo = 'semanal' and dia_semana is not null and data is null)
    or (tipo = 'especial' and data is not null and dia_semana is null)
  )
);

comment on table public.church_schedule is
  'Programação da igreja (cultos semanais e especiais). Sem inscrição — isso é church_events.';

create index if not exists church_schedule_igreja_idx
  on public.church_schedule (church_id, tipo)
  where deleted_at is null;

drop trigger if exists set_church_schedule_company_id on public.church_schedule;
create trigger set_church_schedule_company_id
  before insert or update of church_id on public.church_schedule
  for each row execute function public.set_company_id_from_church();

drop trigger if exists set_church_schedule_updated_at on public.church_schedule;
create trigger set_church_schedule_updated_at
  before update on public.church_schedule
  for each row execute function public.set_updated_at();

alter table public.church_schedule enable row level security;
revoke all on public.church_schedule from anon, authenticated;

-- Programação é pública: é o que a página da igreja mostra.
grant select on public.church_schedule to anon, authenticated;
create policy "church_schedule_select_public"
  on public.church_schedule for select
  to anon, authenticated
  using (deleted_at is null);

-- Quem administra a igreja mantém a programação. Remover é soft delete
-- (update de deleted_at), por isso não há GRANT de delete.
grant insert (church_id, titulo, tipo, dia_semana, data, hora, descricao, local)
  on public.church_schedule to authenticated;
grant update (titulo, tipo, dia_semana, data, hora, descricao, local, deleted_at)
  on public.church_schedule to authenticated;

create policy "church_schedule_insert_admin"
  on public.church_schedule for insert
  to authenticated
  with check (
    exists (
      select 1 from public.churches c
      where c.id = church_id and c.company_id is not null and public.is_company_admin(c.company_id)
    )
  );

create policy "church_schedule_update_admin"
  on public.church_schedule for update
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id))
  with check (company_id is not null and public.is_company_admin(company_id));

notify pgrst, 'reload schema';
