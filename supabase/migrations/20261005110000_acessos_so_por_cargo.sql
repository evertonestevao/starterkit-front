-- ---------------------------------------------------------------------------
-- Acessos: um jeito só — o cargo
-- ---------------------------------------------------------------------------
-- Havia dois caminhos para o mesmo acesso: o cargo (Configurações → Acessos)
-- e as autorizações antigas na ficha do membro (company_members.pode_acompanhar
-- e pode_gerir_ebd). O Responsável tirava a EBD de um cargo e a pessoa
-- continuava entrando pela autorização antiga, sem ninguém entender por quê.
--
-- Agora só o cargo libera. Quem tinha autorização na ficha recebe um cargo
-- equivalente, para ninguém perder acesso; as duas colunas saem.
--
-- Quem tem MAIS DE UM cargo usa a soma: basta um dos cargos liberar o módulo.
--
-- E um fecho de segurança que a mudança torna obrigatório: dar ou tirar
-- cargo passa a ser só de quem administra a igreja. Antes bastava ter acesso
-- a Membros — e, como cargo agora é acesso, a pessoa podia se dar o cargo
-- "Pastor" e abrir todos os módulos.

-- ---------------------------------------------------------------------------
-- 1. O cargo libera o módulo nesta igreja? (regra única, sem depender de quem pergunta)
-- ---------------------------------------------------------------------------
-- A definição mais próxima vence (a própria igreja, a mãe, a avó...); sem
-- nenhuma, vale o padrão do cargo. Cargo desativado não libera nada.
create or replace function public.cargo_libera(p_church_id uuid, p_cargo_id uuid, p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select ca.permitido
      from public.churches minha
      join public.churches acima on minha.path <@ acima.path and acima.deleted_at is null
      join public.cargo_acessos ca on ca.church_id = acima.id and ca.deleted_at is null
      where minha.id = p_church_id
        and ca.cargo_id = p_cargo_id
        and ca.modulo = p_modulo
      order by nlevel(acima.path) desc
      limit 1
    ),
    (select p_modulo = any (cg.acessos_padrao) from public.cargos cg where cg.id = p_cargo_id and cg.deleted_at is null),
    false
  )
  and exists (select 1 from public.cargos cg where cg.id = p_cargo_id and cg.deleted_at is null);
$$;

-- Só uso interno (outras funções definer e esta migration).
revoke all on function public.cargo_libera(uuid, uuid, text) from public, anon, authenticated;

-- A pessoa tem o módulo por ALGUM dos cargos dela (soma dos cargos).
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
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
      and public.cargo_libera(minha.id, rc.cargo_id, p_modulo)
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Cargos equivalentes às autorizações antigas
-- ---------------------------------------------------------------------------
insert into public.cargos (slug, nome, descricao, unico, ordem, acessos_padrao) values
  ('auxiliar_chamada', 'Auxiliar da chamada', 'Faz a chamada dos cultos e acompanha quem está faltando.', false, 14,
   array['dashboard', 'acompanhamento', 'membros']),
  ('secretario_ebd', 'Secretário(a) da EBD', 'Cuida da Escola Dominical inteira: classes, matrículas e relatórios.', false, 12,
   array['dashboard', 'ebd'])
on conflict (slug) do nothing;

-- Quem tinha a autorização e ainda não tem o acesso por algum cargo recebe o
-- cargo equivalente. (Responsável e Administrador já acessam tudo.)
insert into public.rol_membro_cargos (membro_id, cargo_id, church_id)
select m.id, (select id from public.cargos where slug = 'auxiliar_chamada'), m.church_id
from public.company_members cm
join public.churches ch on ch.company_id = cm.company_id and ch.deleted_at is null
join public.rol_membros m on m.church_id = ch.id and m.user_id = cm.user_id and m.deleted_at is null
where cm.deleted_at is null and cm.role = 'member' and cm.pode_acompanhar
  and not (
    exists (select 1 from public.rol_membro_cargos rc
            where rc.membro_id = m.id and public.cargo_libera(ch.id, rc.cargo_id, 'acompanhamento'))
    and exists (select 1 from public.rol_membro_cargos rc
                where rc.membro_id = m.id and public.cargo_libera(ch.id, rc.cargo_id, 'membros'))
  )
on conflict do nothing;

insert into public.rol_membro_cargos (membro_id, cargo_id, church_id)
select m.id, (select id from public.cargos where slug = 'secretario_ebd'), m.church_id
from public.company_members cm
join public.churches ch on ch.company_id = cm.company_id and ch.deleted_at is null
join public.rol_membros m on m.church_id = ch.id and m.user_id = cm.user_id and m.deleted_at is null
where cm.deleted_at is null and cm.role = 'member' and cm.pode_gerir_ebd
  and not exists (select 1 from public.rol_membro_cargos rc
                  where rc.membro_id = m.id and public.cargo_libera(ch.id, rc.cargo_id, 'ebd'))
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. As funções de acesso deixam de olhar as colunas antigas
-- ---------------------------------------------------------------------------
create or replace function public.can_acompanhar(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.churches c
    join public.company_members cm on cm.company_id = c.company_id
    where c.id = p_church_id
      and c.deleted_at is null
      and c.company_id is not null
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
      and (
        cm.role in ('owner', 'admin')
        or public.tem_acesso_por_cargo(c.company_id, 'acompanhamento')
        or public.tem_acesso_por_cargo(c.company_id, 'membros')
      )
  );
$$;

create or replace function public.can_gerir_ebd(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.churches c
    join public.company_members cm on cm.company_id = c.company_id
    where c.id = p_church_id
      and c.deleted_at is null
      and cm.user_id = auth.uid()
      and cm.deleted_at is null
      and (cm.role in ('owner', 'admin') or public.tem_acesso_por_cargo(c.company_id, 'ebd'))
  );
$$;

alter table public.company_members drop column pode_acompanhar;
alter table public.company_members drop column pode_gerir_ebd;

-- ---------------------------------------------------------------------------
-- 4. Dar e tirar cargo: só quem administra a igreja
-- ---------------------------------------------------------------------------
-- Ler continua com quem acompanha (a lista de membros mostra os cargos).
drop policy "rol_membro_cargos_insert_own" on public.rol_membro_cargos;
create policy "rol_membro_cargos_insert_admin"
  on public.rol_membro_cargos for insert
  to authenticated
  with check (
    exists (
      select 1 from public.churches c
      where c.id = rol_membro_cargos.church_id
        and c.deleted_at is null
        and c.company_id is not null
        and public.is_company_admin(c.company_id)
    )
  );

drop policy "rol_membro_cargos_delete_own" on public.rol_membro_cargos;
create policy "rol_membro_cargos_delete_admin"
  on public.rol_membro_cargos for delete
  to authenticated
  using (
    exists (
      select 1 from public.churches c
      where c.id = rol_membro_cargos.church_id
        and c.deleted_at is null
        and c.company_id is not null
        and public.is_company_admin(c.company_id)
    )
  );

notify pgrst, 'reload schema';
