-- ---------------------------------------------------------------------------
-- Pedidos de oração: estado ("já oramos") e anotação da liderança
-- ---------------------------------------------------------------------------
-- Só havia a lista e o aviso de não lidos: com o tempo virava uma fila longa
-- sem saber o que já foi atendido. Agora a liderança marca "já oramos" (um
-- a um ou todos de uma vez, como depois de um culto de oração) e pode
-- guardar uma anotação curta no pedido.
--
-- Continua dado sensível (LGPD): só quem ADMINISTRA a própria igreja lê e
-- marca. Não entra nos acessos por cargo nem sobe para a igreja acima.

alter table public.prayer_requests
  add column if not exists orado_em timestamptz,
  add column if not exists orado_por uuid references auth.users (id) on delete set null,
  add column if not exists anotacao text check (anotacao is null or length(anotacao) <= 500);

-- O formulário público tinha INSERT na tabela inteira; com as colunas novas,
-- quem envia o pedido poderia gravar "já oramos". Passa a valer só para os
-- campos do pedido (company_id continua vindo do trigger, que ignora o enviado).
revoke insert on public.prayer_requests from anon, authenticated;
grant insert (church_id, company_id, name, message) on public.prayer_requests to anon, authenticated;

create index if not exists prayer_requests_pendentes_idx
  on public.prayer_requests (company_id, created_at desc)
  where orado_em is null;

-- Marca (ou desmarca) pedidos como orados. p_ids nulo = todos os que ainda
-- aguardam oração na igreja. Devolve quantos mudaram.
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
     and (p_ids is null or id = any (p_ids))
     -- Só o que muda de estado: marcar de novo não troca a data de quem já estava.
     and (orado_em is null) = p_orado;
  get diagnostics v_mudou = row_count;
  return v_mudou;
end;
$$;

revoke all on function public.marcar_pedidos_orados(uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.marcar_pedidos_orados(uuid, uuid[], boolean) to authenticated;

-- Anotação da liderança no pedido (vazia = apaga).
create or replace function public.anotar_pedido_oracao(p_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.prayer_requests where id = p_id;
  if v_company is null or not public.is_company_admin(v_company) then
    raise exception 'pedido não encontrado' using errcode = 'P0002';
  end if;
  update public.prayer_requests
     set anotacao = nullif(btrim(coalesce(p_texto, '')), '')
   where id = p_id;
end;
$$;

revoke all on function public.anotar_pedido_oracao(uuid, text) from public, anon, authenticated;
grant execute on function public.anotar_pedido_oracao(uuid, text) to authenticated;

notify pgrst, 'reload schema';
