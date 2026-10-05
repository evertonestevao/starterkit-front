-- ---------------------------------------------------------------------------
-- Acessos por cargo: padrão inicial dos cargos da plataforma
-- ---------------------------------------------------------------------------
-- Até aqui nenhum cargo liberava nada enquanto a igreja não configurasse. O
-- Responsável abria Configurações → Acessos e via tudo desmarcado. Agora os
-- cargos da plataforma já nascem com um ponto de partida (decidido com o
-- dono do produto em 2026-10-04); cada igreja ajusta em cima.
--
-- A ordem continua: a própria igreja > a igreja acima mais próxima > este
-- padrão. Cargo criado pela igreja não tem padrão (nada liberado).
--
-- A coluna NÃO entra nos GRANTs de insert/update de `cargos`: a igreja não
-- muda o padrão de um cargo, só as próprias escolhas em cargo_acessos.

alter table public.cargos
  add column if not exists acessos_padrao text[] not null default '{}'
  check (acessos_padrao <@ array['acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns']);

comment on column public.cargos.acessos_padrao is
  'Módulos liberados para o cargo quando nenhuma igreja da rede definiu. Só os cargos da plataforma têm.';

update public.cargos set acessos_padrao = array['acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns']
  where church_id is null and slug in ('pastor', 'pastor_auxiliar');
update public.cargos set acessos_padrao = array['acompanhamento', 'membros', 'programacao', 'events']
  where church_id is null and slug = 'secretario';
update public.cargos set acessos_padrao = array['acompanhamento', 'membros']
  where church_id is null and slug in ('presbitero', 'evangelista', 'missionario');
update public.cargos set acessos_padrao = array['acompanhamento']
  where church_id is null and slug in ('diacono', 'diaconisa', 'obreiro');
update public.cargos set acessos_padrao = array['programacao', 'events']
  where church_id is null and slug in ('lider_louvor', 'lider_jovens');
update public.cargos set acessos_padrao = array['campaigns']
  where church_id is null and slug = 'tesoureiro';
-- professor_ebd fica sem padrão de propósito: o professor já entra na EBD e
-- vê só as classes em que ensina (ebd_professores / can_ebd_classe). Marcar
-- "ebd" para o cargo daria a escola inteira.

-- O padrão entra como último recurso: sem linha de nenhuma igreja da rede
-- para o cargo e módulo, vale cargos.acessos_padrao.
create or replace function public.tem_acesso_por_cargo(p_company_id uuid, p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    join public.churches minha on minha.company_id = cm.company_id and minha.deleted_at is null
    join public.rol_membros m on m.church_id = minha.id and m.user_id = cm.user_id and m.deleted_at is null
    join public.rol_membro_cargos rc on rc.membro_id = m.id
    join public.cargos cg on cg.id = rc.cargo_id and cg.deleted_at is null
    left join lateral (
      select ca.permitido
      from public.cargo_acessos ca
      join public.churches acima on acima.id = ca.church_id and acima.deleted_at is null
      where minha.path <@ acima.path
        and ca.cargo_id = cg.id
        and ca.modulo = p_modulo
        and ca.deleted_at is null
      order by nlevel(acima.path) desc
      limit 1
    ) vale on true
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
      and coalesce(vale.permitido, p_modulo = any (cg.acessos_padrao))
  );
$$;

notify pgrst, 'reload schema';
