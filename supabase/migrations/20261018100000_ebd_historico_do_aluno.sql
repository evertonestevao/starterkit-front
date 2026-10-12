-- EBD: página do aluno (dados, resumo e o histórico de chamadas) e edição dos
-- dados de quem a EBD cadastrou.
--
-- Quem vê: quem enxerga alguma classe em que o aluno está ou esteve
-- (can_ebd_classe: gestão da EBD, ou o professor da classe). Só aparecem as
-- aulas das classes que quem pede enxerga. A igreja de cima não vê.
--
-- Quem edita: a gestão da EBD, e só o aluno que a própria EBD cadastrou e que
-- ainda não é membro. Quando a secretaria da igreja marca a pessoa como membro
-- (ou ela ganha login), os dados passam a ser do cadastro de Membros.

alter table public.rol_membros
  add column if not exists cadastrado_pela_ebd boolean not null default false;

comment on column public.rol_membros.cadastrado_pela_ebd is
  'A pessoa entrou pelo cadastro de aluno da EBD (ebd_matricular_novo). Enquanto não for membro, a gestão da EBD edita nome, telefone e nascimento.';

-- Quem já foi cadastrado pela EBD antes desta coluna: não é membro, não entra
-- na chamada dos cultos, não tem login e tem matrícula na EBD.
update public.rol_membros m
set cadastrado_pela_ebd = true
where not m.membro_igreja and not m.participa_chamada and m.user_id is null
  and exists (select 1 from public.ebd_matriculas mt where mt.membro_id = m.id)
  and not m.cadastrado_pela_ebd;

-- Aluno novo passa a nascer marcado.
create or replace function public.ebd_matricular_novo(
  p_classe_id uuid,
  p_nome text,
  p_telefone text,
  p_nascimento date,
  p_visitante_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classe public.ebd_classes%rowtype;
  v_membro uuid;
begin
  select * into v_classe from public.ebd_classes where id = p_classe_id and deleted_at is null and ativa;
  if v_classe.id is null or not public.can_ebd_classe(p_classe_id) then
    raise exception 'classe nao encontrada' using errcode = 'P0002';
  end if;

  insert into public.rol_membros (church_id, nome, whatsapp, nascimento, membro_igreja, participa_chamada, cadastrado_pela_ebd)
  values (v_classe.church_id, trim(p_nome), nullif(trim(coalesce(p_telefone, '')), ''), p_nascimento, false, false, true)
  returning id into v_membro;

  -- Pessoa nova: é sempre a primeira matrícula.
  insert into public.ebd_matriculas (classe_id, membro_id, church_id, desde)
  values (p_classe_id, v_membro, v_classe.church_id, public.ebd_domingo_da_semana());

  if p_visitante_id is not null then
    update public.ebd_visitantes set membro_id = v_membro
    where id = p_visitante_id and classe_id = p_classe_id;
  end if;
  return v_membro;
end;
$$;

-- A gestão da EBD pode editar este aluno?
create or replace function public.ebd_pode_editar_aluno(p_membro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rol_membros m
    where m.id = p_membro_id and m.deleted_at is null
      and m.cadastrado_pela_ebd and not m.membro_igreja and m.user_id is null
      and public.can_gerir_ebd(m.church_id)
  );
$$;

-- Dados, matrículas e chamadas do aluno, só das classes que quem pede enxerga.
create or replace function public.ebd_historico_do_aluno(p_membro_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with visiveis as (
    select mt.id, mt.classe_id, mt.desde, mt.ate, k.nome as classe_nome
    from public.ebd_matriculas mt
    join public.ebd_classes k on k.id = mt.classe_id and k.deleted_at is null
    where mt.membro_id = p_membro_id and public.can_ebd_classe(mt.classe_id)
  )
  select jsonb_build_object(
    'membro_id', m.id,
    'nome', m.nome,
    'whatsapp', m.whatsapp,
    'nascimento', m.nascimento,
    'membro_igreja', m.membro_igreja,
    'pode_editar', public.ebd_pode_editar_aluno(m.id),
    'matriculas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'classe_id', v.classe_id, 'classe_nome', v.classe_nome, 'desde', v.desde, 'ate', v.ate
      ) order by v.desde desc), '[]'::jsonb) from visiveis v
    ),
    'aulas', (
      select coalesce(jsonb_agg(x.linha order by x.data desc), '[]'::jsonb)
      from (
        select a.data, jsonb_build_object(
          'data', a.data, 'classe_nome', k.nome, 'estado', p.estado, 'licao', a.licao
        ) as linha
        from public.ebd_presencas p
        join public.ebd_aulas a on a.id = p.aula_id
        join public.ebd_classes k on k.id = a.classe_id
        where p.membro_id = m.id
          and a.classe_id in (select classe_id from visiveis)
        order by a.data desc
        limit 200
      ) x
    )
  )
  from public.rol_membros m
  where m.id = p_membro_id and m.deleted_at is null
    and exists (select 1 from visiveis);
$$;

create or replace function public.ebd_editar_aluno(p_membro_id uuid, p_nome text, p_telefone text, p_nascimento date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membro public.rol_membros%rowtype;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_telefone text := nullif(btrim(coalesce(p_telefone, '')), '');
begin
  select * into v_membro from public.rol_membros where id = p_membro_id and deleted_at is null;
  -- Mesma resposta para "não existe", "não é da sua igreja" e "já é da secretaria".
  if v_membro.id is null or not public.ebd_pode_editar_aluno(p_membro_id) then
    raise exception 'aluno nao encontrado' using errcode = 'P0002';
  end if;
  if char_length(v_nome) not between 2 and 120
     or (v_telefone is not null and char_length(v_telefone) not between 8 and 20)
     or (p_nascimento is not null and (p_nascimento > current_date or p_nascimento < date '1900-01-01')) then
    raise exception 'dados invalidos' using errcode = '23514';
  end if;

  update public.rol_membros
  set nome = v_nome, whatsapp = v_telefone, nascimento = p_nascimento
  where id = p_membro_id;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_membro.company_id, auth.uid(), 'ebd.aluno_editado', 'rol_membro', p_membro_id,
          jsonb_build_object('nome_antes', v_membro.nome, 'nome', v_nome));
end;
$$;

revoke all on function public.ebd_pode_editar_aluno(uuid) from public, anon, authenticated;
revoke all on function public.ebd_historico_do_aluno(uuid) from public, anon, authenticated;
revoke all on function public.ebd_editar_aluno(uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.ebd_pode_editar_aluno(uuid) to authenticated;
grant execute on function public.ebd_historico_do_aluno(uuid) to authenticated;
grant execute on function public.ebd_editar_aluno(uuid, text, text, date) to authenticated;

notify pgrst, 'reload schema';
