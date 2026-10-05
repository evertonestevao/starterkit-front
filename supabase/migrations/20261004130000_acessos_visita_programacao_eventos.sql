-- ---------------------------------------------------------------------------
-- Acessos por cargo: Programação, Eventos e Quem quer visita saem do "todo
-- membro vê" e passam a depender do cargo
-- ---------------------------------------------------------------------------
-- Até aqui qualquer login de membro via esses três menus, e a tela de Acessos
-- não tinha como tirá-los (ex.: do professor da EBD, que só precisa da
-- classe dele). Agora "relationships" (pedidos de visita) vira módulo
-- liberável, e os três só aparecem para quem administra ou tem o cargo.
--
-- Programação e eventos publicados continuam públicos (é a página da
-- igreja). O que fecha aqui é dado pessoal: quem pediu visita e quem se
-- inscreveu em evento.

alter table public.cargo_acessos drop constraint cargo_acessos_modulo_check;
alter table public.cargo_acessos add constraint cargo_acessos_modulo_check check (
  modulo in ('acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns', 'relationships')
);

alter table public.cargos drop constraint cargos_acessos_padrao_check;
alter table public.cargos add constraint cargos_acessos_padrao_check check (
  acessos_padrao <@ array['acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns', 'relationships']
);

-- Padrão: quem visita é a liderança pastoral e a secretaria.
update public.cargos set acessos_padrao = acessos_padrao || array['relationships']
where church_id is null
  and slug in ('pastor', 'pastor_auxiliar', 'secretario', 'presbitero', 'evangelista', 'missionario',
               'diacono', 'diaconisa', 'obreiro')
  and not ('relationships' = any (acessos_padrao));

create or replace function public.meus_acessos()
returns table (company_id uuid, modulo text)
language sql
stable
security definer
set search_path = public
as $$
  select cm.company_id, mod.modulo
  from public.company_members cm
  cross join unnest(array['acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns', 'relationships'])
    as mod(modulo)
  where cm.user_id = auth.uid()
    and cm.deleted_at is null
    and public.tem_acesso_por_cargo(cm.company_id, mod.modulo);
$$;

-- Pedidos de visita: quem administra a igreja (ou uma acima, como antes) ou
-- quem tem o cargo liberado NA PRÓPRIA igreja. Antes, qualquer membro lia.
drop policy if exists "visitors_select_tree" on public.visitors;
create policy "visitors_select_tree"
  on public.visitors for select
  to authenticated
  using (
    public.can_admin_view_church(church_id)
    or (company_id is not null and public.tem_acesso_por_cargo(company_id, 'relationships'))
  );

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

  -- Só a equipe da PRÓPRIA igreja com acesso ao módulo.
  if v_company is null or not public.tem_acesso(v_company, 'relationships') then
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

-- Inscrições em evento (nome e contato): mesma régua.
drop policy if exists "event_signups_select_tree" on public.event_signups;
create policy "event_signups_select_tree"
  on public.event_signups for select
  to authenticated
  using (
    public.can_admin_view_church(church_id)
    or (company_id is not null and public.tem_acesso_por_cargo(company_id, 'events'))
  );

notify pgrst, 'reload schema';
