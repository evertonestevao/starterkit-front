-- ---------------------------------------------------------------------------
-- "Quem quer visita": pedidos de visita do Pastor (ou de alguém da igreja)
-- ---------------------------------------------------------------------------
-- O formulário público (tabela visitors) passa a ser pedido de visita, com
-- telefone obrigatório (validado no app) e um gerenciamento: a equipe marca
-- se a visita foi feita, quando e por quem.

alter table public.visitors
  add column if not exists endereco text check (endereco is null or length(endereco) <= 300),
  add column if not exists mensagem text check (mensagem is null or length(mensagem) <= 1000),
  add column if not exists visitado_em date,
  add column if not exists visitado_por text check (visitado_por is null or length(visitado_por) <= 120),
  add column if not exists visita_obs text check (visita_obs is null or length(visita_obs) <= 1000),
  add column if not exists atualizado_por uuid references auth.users (id) on delete set null,
  add column if not exists updated_at timestamptz,
  add column if not exists deleted_at timestamptz;

-- O público só escreve os campos do pedido; nunca "visita feita".
revoke insert on public.visitors from anon, authenticated;
grant insert (church_id, name, contact, endereco, mensagem) on public.visitors to anon, authenticated;

drop policy if exists "visitors_insert_public" on public.visitors;
create policy "visitors_insert_public"
  on public.visitors for insert
  to anon, authenticated
  with check (
    church_id is not null and name <> '' and contact <> ''
    and visitado_em is null and visitado_por is null and visita_obs is null and deleted_at is null
  );

-- Registro da visita: só a equipe da PRÓPRIA igreja (a sede não gerencia o
-- pedido de outra igreja). Escrita via RPC; sem GRANT de update na tabela.
create or replace function public.registrar_visita(
  p_visitor_id uuid,
  p_visitado_em date,
  p_visitado_por text,
  p_obs text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company
  from public.visitors
  where id = p_visitor_id and deleted_at is null;

  if v_company is null or not public.is_company_member(v_company) then
    raise exception 'pedido não encontrado' using errcode = 'P0002';
  end if;

  if p_visitado_em is not null and (p_visitado_por is null or btrim(p_visitado_por) = '') then
    raise exception 'informe quem fez a visita' using errcode = '22023';
  end if;

  update public.visitors
     set visitado_em = p_visitado_em,
         visitado_por = case when p_visitado_em is null then null else btrim(p_visitado_por) end,
         visita_obs = nullif(btrim(coalesce(p_obs, '')), ''),
         atualizado_por = auth.uid(),
         updated_at = now()
   where id = p_visitor_id;
end;
$$;

revoke all on function public.registrar_visita(uuid, date, text, text) from public, anon, authenticated;
grant execute on function public.registrar_visita(uuid, date, text, text) to authenticated;

create index if not exists visitors_pendentes_idx
  on public.visitors (company_id, created_at desc)
  where visitado_em is null and deleted_at is null;

notify pgrst, 'reload schema';
