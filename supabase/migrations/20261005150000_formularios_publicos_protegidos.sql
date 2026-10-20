-- ---------------------------------------------------------------------------
-- Formulários públicos: só o servidor grava, limites no banco e "ocultar"
-- ---------------------------------------------------------------------------
-- A página pública tem quatro formulários sem login: pedido de oração, pedido
-- de visita, inscrição em evento e doação de campanha. Até aqui:
--   * oração e visita aceitavam INSERT direto com a chave pública (anon),
--     pulando a validação e qualquer limite de envios do site;
--   * inscrição e doação passavam por funções, mas chamáveis direto por anon;
--   * o banco quase não limitava tamanho;
--   * não havia como tirar da tela um pedido ofensivo ou de spam.
--
-- Agora só o servidor da aplicação (service_role) grava nesses quatro. É lá
-- que ficam o limite de envios por pessoa e a barreira contra robôs. O
-- banco guarda a última linha de defesa (tamanhos e formato).

-- ---------------------------------------------------------------------------
-- 1. Só o servidor grava
-- ---------------------------------------------------------------------------
revoke insert on public.prayer_requests from anon, authenticated;
revoke insert on public.visitors from anon, authenticated;
drop policy if exists "prayer_requests_insert_public" on public.prayer_requests;
drop policy if exists "visitors_insert_public" on public.visitors;

revoke all on function public.sign_up_for_event(uuid, text, text) from public, anon, authenticated;
revoke all on function public.criar_doacao_pix_campanha(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.registrar_doacao_gateway_campanha(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.sign_up_for_event(uuid, text, text) to service_role;
grant execute on function public.criar_doacao_pix_campanha(uuid, text, text, integer) to service_role;
grant execute on function public.registrar_doacao_gateway_campanha(uuid, text, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Limites no próprio banco (NOT VALID: valem para o que entrar daqui em
--    diante; pedidos antigos, que podem ter e-mail no lugar do telefone, ficam)
-- ---------------------------------------------------------------------------
alter table public.prayer_requests
  add constraint prayer_requests_name_tamanho check (name is null or char_length(name) <= 120) not valid,
  add constraint prayer_requests_message_tamanho check (char_length(message) between 3 and 2000) not valid;

alter table public.visitors
  add constraint visitors_name_tamanho check (char_length(name) between 2 and 120) not valid,
  -- Telefone: só dígitos e sinais comuns, com 10 a 13 dígitos (DDD e, se vier, o 55).
  add constraint visitors_contact_telefone check (
    char_length(contact) <= 20
    and contact ~ '^[0-9 ()+.-]+$'
    and char_length(regexp_replace(contact, '\D', '', 'g')) between 10 and 13
  ) not valid;

alter table public.event_signups
  add constraint event_signups_person_name_tamanho check (char_length(person_name) between 2 and 120) not valid,
  add constraint event_signups_contact_tamanho check (char_length(contact) between 5 and 160) not valid;

-- ---------------------------------------------------------------------------
-- 3. Ocultar pedido ofensivo ou de spam
-- ---------------------------------------------------------------------------
-- Pedido de oração não se apaga (é registro do que a comunidade enviou), mas
-- quem administra a igreja pode tirá-lo da tela. O de visita já tinha
-- deleted_at: ocultar é preenchê-lo.
alter table public.prayer_requests add column if not exists oculto_em timestamptz;

create or replace function public.ocultar_pedido_oracao(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.prayer_requests where id = p_id and oculto_em is null;
  if v_company is null or not public.is_company_admin(v_company) then
    raise exception 'pedido não encontrado' using errcode = 'P0002';
  end if;
  update public.prayer_requests set oculto_em = now() where id = p_id;
end;
$$;

revoke all on function public.ocultar_pedido_oracao(uuid) from public, anon, authenticated;
grant execute on function public.ocultar_pedido_oracao(uuid) to authenticated;

create or replace function public.ocultar_pedido_visita(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.visitors where id = p_id and deleted_at is null;
  if v_company is null or not public.tem_acesso(v_company, 'relationships') then
    raise exception 'pedido não encontrado' using errcode = 'P0002';
  end if;
  delete from public.visita_participantes where visitor_id = p_id;
  update public.visitors
     set deleted_at = now(), atualizado_por = auth.uid(), updated_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.ocultar_pedido_visita(uuid) from public, anon, authenticated;
grant execute on function public.ocultar_pedido_visita(uuid) to authenticated;

-- "Marcar todos como orados" não mexe em pedido oculto.
create or replace function public.marcar_pedidos_orados(p_company_id uuid, p_ids uuid[], p_orado boolean)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mudou int;
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_ids is not null and cardinality(p_ids) > 500 then
    raise exception 'pedidos demais de uma vez' using errcode = '22023';
  end if;

  update public.prayer_requests
     set orado_em = case when p_orado then now() else null end,
         orado_por = case when p_orado then auth.uid() else null end
   where company_id = p_company_id
     and oculto_em is null
     and (p_ids is null or id = any (p_ids))
     -- Só o que muda de estado: marcar de novo não troca a data de quem já estava.
     and (orado_em is null) = p_orado;
  get diagnostics v_mudou = row_count;
  return v_mudou;
end;
$$;

notify pgrst, 'reload schema';
