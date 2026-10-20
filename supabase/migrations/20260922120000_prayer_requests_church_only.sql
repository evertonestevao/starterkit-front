-- ---------------------------------------------------------------------------
-- Pedido de oração: conteúdo só para a própria igreja
-- ---------------------------------------------------------------------------
-- Pedido de oração conta doença, luto, vício, conflito de família — e, sendo
-- religioso, é dado sensível pela LGPD. A migration da hierarquia deu leitura
-- a toda a árvore, o que significava a sede lendo o pedido que alguém
-- escreveu para a congregação do bairro. Isso volta atrás:
--
--   - o TEXTO fica na igreja que o recebeu, e só para quem lidera (owner ou
--     admin). Member não lê mais nem o da própria igreja.
--   - a sede e a subsede recebem CONTAGEM, nunca conteúdo: dá para saber que
--     a congregação recebeu 14 pedidos no mês e organizar apoio, sem ler um.
--
-- Visitantes e inscrições em evento seguem visíveis pela árvore: são dados de
-- contato que a pessoa deixou para ser procurada.

drop policy if exists "prayer_requests_select_tree" on public.prayer_requests;
drop policy if exists "prayer_requests_select_company" on public.prayer_requests;

create policy "prayer_requests_select_own_church_admin"
  on public.prayer_requests for select
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id));

-- Contagem por igreja da minha subárvore (incluindo a minha). Sem texto,
-- sem nome e sem contato — só quantos e de qual igreja.
create or replace function public.prayer_counts_tree(p_dias integer default 30)
returns table (church_id uuid, church_name text, total integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.church_id, c.name, count(*)::integer
  from public.prayer_requests p
  join public.churches c on c.id = p.church_id
  where public.can_admin_view_church(p.church_id)
    and p.created_at >= now() - make_interval(days => greatest(least(p_dias, 365), 1))
  group by 1, 2
  order by 3 desc, 2;
$$;

revoke all on function public.prayer_counts_tree(integer) from public, anon, authenticated;
grant execute on function public.prayer_counts_tree(integer) to authenticated;

notify pgrst, 'reload schema';
