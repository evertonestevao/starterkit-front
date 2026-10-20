-- ---------------------------------------------------------------------------
-- Acessos por cargo: o Dashboard (painel) também entra na lista
-- ---------------------------------------------------------------------------
-- O painel era de todo login. Agora é mais uma caixa em Configurações →
-- Acessos: o Responsável decide que cargos veem o painel. Quem não tem cai
-- direto no primeiro menu que possui (ex.: o professor, na EBD).
--
-- O painel não tem dado próprio: cada número dele vem de um módulo e só
-- aparece para quem tem aquele módulo. Por isso aqui não muda policy
-- nenhuma — só a lista de módulos aceitos e o padrão dos cargos.

alter table public.cargo_acessos drop constraint cargo_acessos_modulo_check;
alter table public.cargo_acessos add constraint cargo_acessos_modulo_check check (
  modulo in ('dashboard', 'acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns', 'relationships')
);

alter table public.cargos drop constraint cargos_acessos_padrao_check;
alter table public.cargos add constraint cargos_acessos_padrao_check check (
  acessos_padrao <@ array['dashboard', 'acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns', 'relationships']
);

-- Padrão: todos os cargos da plataforma veem o painel, menos o professor da
-- EBD (entra direto na classe dele).
update public.cargos set acessos_padrao = array['dashboard'] || acessos_padrao
where church_id is null
  and slug is distinct from 'professor_ebd'
  and not ('dashboard' = any (acessos_padrao));

create or replace function public.meus_acessos()
returns table (company_id uuid, modulo text)
language sql
stable
security definer
set search_path = public
as $$
  select cm.company_id, mod.modulo
  from public.company_members cm
  cross join unnest(array['dashboard', 'acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns', 'relationships'])
    as mod(modulo)
  where cm.user_id = auth.uid()
    and cm.deleted_at is null
    and public.tem_acesso_por_cargo(cm.company_id, mod.modulo);
$$;

notify pgrst, 'reload schema';
