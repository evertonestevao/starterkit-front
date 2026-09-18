-- ---------------------------------------------------------------------------
-- Eventos da igreja, com inscrição amarrada ao evento
-- ---------------------------------------------------------------------------
-- Até aqui não existia "evento": o visitante digitava o nome num campo livre.
-- A igreja recebia "Retiro", "retiro jovens" e "retirro" como três eventos, e
-- qualquer um podia se inscrever em algo que nem acontece. Agora a igreja
-- publica o evento (nome, data, local, preço, descrição) e a inscrição aponta
-- para ele.

create table if not exists public.church_events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  -- Regra do projeto: tabela de negócio tem company_id. Preenchido por
  -- trigger a partir da igreja, nunca pelo cliente.
  company_id uuid references public.companies (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 2 and 120),
  descricao text check (descricao is null or char_length(descricao) <= 4000),
  inicio timestamptz not null,
  fim timestamptz,
  -- Null = no endereço da própria igreja.
  local text check (local is null or char_length(local) <= 200),
  -- Zero = gratuito. A plataforma NÃO cobra inscrição: evento pago é pago
  -- direto à igreja, e a página mostra a chave PIX dela quando existir.
  preco_cents integer not null default 0 check (preco_cents >= 0 and preco_cents <= 10000000),
  inscricoes_abertas boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint church_events_fim_depois_do_inicio check (fim is null or fim >= inicio)
);

comment on table public.church_events is
  'Eventos publicados pela igreja na página pública, com inscrição.';

create index if not exists church_events_proximos_idx
  on public.church_events (church_id, inicio)
  where deleted_at is null;

drop trigger if exists set_church_events_company_id on public.church_events;
create trigger set_church_events_company_id
  before insert or update of church_id on public.church_events
  for each row execute function public.set_company_id_from_church();

drop trigger if exists set_church_events_updated_at on public.church_events;
create trigger set_church_events_updated_at
  before update on public.church_events
  for each row execute function public.set_updated_at();

alter table public.church_events enable row level security;
revoke all on public.church_events from anon, authenticated;

-- Evento publicado é público: é para isso que existe.
grant select on public.church_events to anon, authenticated;
create policy "church_events_select_public"
  on public.church_events for select
  to anon, authenticated
  using (deleted_at is null);

-- Quem administra a igreja publica e edita (a tela do painel vem depois; a
-- permissão já nasce certa).
grant insert (church_id, titulo, descricao, inicio, fim, local, preco_cents, inscricoes_abertas)
  on public.church_events to authenticated;
grant update (titulo, descricao, inicio, fim, local, preco_cents, inscricoes_abertas, deleted_at)
  on public.church_events to authenticated;

create policy "church_events_insert_admin"
  on public.church_events for insert
  to authenticated
  with check (
    exists (
      select 1 from public.churches c
      where c.id = church_id and c.company_id is not null and public.is_company_admin(c.company_id)
    )
  );

create policy "church_events_update_admin"
  on public.church_events for update
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id))
  with check (company_id is not null and public.is_company_admin(company_id));

-- ---------------------------------------------------------------------------
-- Inscrição
-- ---------------------------------------------------------------------------
alter table public.event_signups
  add column if not exists event_id uuid references public.church_events (id) on delete set null;

create index if not exists event_signups_event_idx on public.event_signups (event_id);

-- A inscrição deixa de ser um INSERT direto: pela API, o anon ainda podia
-- gravar qualquer `event_name`, mesmo sem o campo na tela. Passa a existir só
-- pela função abaixo, que confere o evento e copia o nome dele.
revoke insert on public.event_signups from anon, authenticated;
drop policy if exists "event_signups_insert_public" on public.event_signups;

create or replace function public.sign_up_for_event(
  p_event_id uuid,
  p_person_name text,
  p_contact text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_event public.church_events%rowtype;
  v_nome text := btrim(coalesce(p_person_name, ''));
  v_contato text := btrim(coalesce(p_contact, ''));
  v_id uuid;
begin
  if char_length(v_nome) not between 2 and 120 then
    raise exception 'Informe seu nome' using errcode = 'P0001';
  end if;
  if char_length(v_contato) not between 5 and 160 then
    raise exception 'Deixe um WhatsApp, telefone ou email' using errcode = 'P0001';
  end if;

  select e.* into v_event
  from public.church_events e
  join public.churches c on c.id = e.church_id and c.deleted_at is null
  where e.id = p_event_id and e.deleted_at is null;

  if v_event.id is null then
    raise exception 'Evento não encontrado' using errcode = 'P0002';
  end if;
  if not v_event.inscricoes_abertas then
    raise exception 'As inscrições para este evento estão encerradas' using errcode = 'P0001';
  end if;
  if v_event.inicio <= now() then
    raise exception 'Este evento já começou' using errcode = 'P0001';
  end if;

  insert into public.event_signups (church_id, event_id, event_name, person_name, contact)
  values (v_event.church_id, v_event.id, v_event.titulo, v_nome, v_contato)
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.sign_up_for_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.sign_up_for_event(uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
