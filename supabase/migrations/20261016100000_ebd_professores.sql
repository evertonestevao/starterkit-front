-- EBD → Professores: a gestão da EBD (Responsável, Administrador e a
-- secretaria da EBD) vê quem é professor, em quantas classes está, e dá ou
-- tira o cargo "Professor(a) da EBD".
--
-- Segurança:
--   * a secretaria da EBD não lê o rol nem a tabela de cargos: tudo passa por
--     funções security definer que conferem can_gerir_ebd da igreja;
--   * as funções só mexem no cargo professor_ebd, nunca em outro;
--   * o cargo sozinho não libera menu (o professor entra na EBD por estar numa
--     classe). Se o Responsável ligou outros módulos a esse cargo nesta igreja,
--     dar o cargo seria dar esses acessos: aí só owner/admin dão;
--   * login (acesso ao sistema) continua sendo do Responsável, na ficha.

create or replace function public.ebd_professores_da_igreja(p_church_id uuid)
returns table (membro_id uuid, nome text, tem_cargo boolean, tem_login boolean, classes jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with cargo as (select id from public.cargos where slug = 'professor_ebd'),
  pessoas as (
    select rc.membro_id from public.rol_membro_cargos rc, cargo
    where rc.church_id = p_church_id and rc.cargo_id = cargo.id
    union
    select p.membro_id from public.ebd_professores p
    join public.ebd_classes k on k.id = p.classe_id and k.deleted_at is null and k.ativa
    where p.church_id = p_church_id
  )
  select m.id, m.nome,
         exists (select 1 from public.rol_membro_cargos rc, cargo where rc.membro_id = m.id and rc.cargo_id = cargo.id),
         m.user_id is not null,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', k.id, 'nome', k.nome) order by k.ordem, k.nome)
           from public.ebd_professores p
           join public.ebd_classes k on k.id = p.classe_id and k.deleted_at is null and k.ativa
           where p.membro_id = m.id
         ), '[]'::jsonb)
  from pessoas
  join public.rol_membros m on m.id = pessoas.membro_id and m.deleted_at is null
  where public.can_gerir_ebd(p_church_id)
  order by m.nome;
$$;

-- O cargo professor_ebd libera, nesta igreja, algum módulo além da EBD?
create or replace function public.ebd_cargo_professor_libera_mais(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cargos c,
         unnest(array['dashboard', 'acompanhamento', 'membros', 'programacao', 'events', 'campaigns',
                      'relationships', 'tesouraria', 'vendas', 'rede_cadastro']) as m(modulo)
    where c.slug = 'professor_ebd'
      and public.cargo_libera(p_church_id, c.id, m.modulo)
  );
$$;

create or replace function public.ebd_dar_cargo_professor(p_membro_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membro public.rol_membros%rowtype;
  v_cargo uuid;
  v_role text;
begin
  select * into v_membro from public.rol_membros where id = p_membro_id and deleted_at is null;
  -- Mesma resposta para "não existe" e "não é da sua igreja".
  if v_membro.id is null or not public.can_gerir_ebd(v_membro.church_id) then
    raise exception 'membro não encontrado' using errcode = 'P0002';
  end if;

  select cm.role into v_role from public.company_members cm
  where cm.company_id = v_membro.company_id and cm.user_id = auth.uid() and cm.deleted_at is null;
  if coalesce(v_role, '') not in ('owner', 'admin') and public.ebd_cargo_professor_libera_mais(v_membro.church_id) then
    raise exception 'cargo libera outros modulos' using errcode = '42501';
  end if;

  select id into v_cargo from public.cargos where slug = 'professor_ebd';
  insert into public.rol_membro_cargos (membro_id, cargo_id, church_id)
  values (p_membro_id, v_cargo, v_membro.church_id)
  on conflict (membro_id, cargo_id) do nothing;

  if found then
    insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
    values (v_membro.company_id, auth.uid(), 'ebd.professor_cargo_dado', 'rol_membro', p_membro_id,
            jsonb_build_object('nome', v_membro.nome));
  end if;
end;
$$;

-- Tirar o cargo: só de quem não está dando aula em nenhuma classe ativa
-- (primeiro tira das classes, na própria classe).
create or replace function public.ebd_tirar_cargo_professor(p_membro_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membro public.rol_membros%rowtype;
begin
  select * into v_membro from public.rol_membros where id = p_membro_id and deleted_at is null;
  if v_membro.id is null or not public.can_gerir_ebd(v_membro.church_id) then
    raise exception 'membro não encontrado' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.ebd_professores p
    join public.ebd_classes k on k.id = p.classe_id and k.deleted_at is null and k.ativa
    where p.membro_id = p_membro_id
  ) then
    raise exception 'professor ainda tem classe' using errcode = '23514';
  end if;

  delete from public.rol_membro_cargos rc
  using public.cargos c
  where rc.membro_id = p_membro_id and rc.cargo_id = c.id and c.slug = 'professor_ebd';

  if found then
    insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
    values (v_membro.company_id, auth.uid(), 'ebd.professor_cargo_tirado', 'rol_membro', p_membro_id,
            jsonb_build_object('nome', v_membro.nome));
  end if;
end;
$$;

revoke all on function public.ebd_professores_da_igreja(uuid) from public, anon, authenticated;
revoke all on function public.ebd_cargo_professor_libera_mais(uuid) from public, anon, authenticated;
revoke all on function public.ebd_dar_cargo_professor(uuid) from public, anon, authenticated;
revoke all on function public.ebd_tirar_cargo_professor(uuid) from public, anon, authenticated;
grant execute on function public.ebd_professores_da_igreja(uuid) to authenticated;
grant execute on function public.ebd_cargo_professor_libera_mais(uuid) to authenticated;
grant execute on function public.ebd_dar_cargo_professor(uuid) to authenticated;
grant execute on function public.ebd_tirar_cargo_professor(uuid) to authenticated;

notify pgrst, 'reload schema';
