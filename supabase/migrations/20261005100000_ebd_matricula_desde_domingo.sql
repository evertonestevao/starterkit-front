-- ---------------------------------------------------------------------------
-- EBD: a primeira matrícula vale desde o domingo da semana
-- ---------------------------------------------------------------------------
-- A matrícula começava "hoje". Quem cadastrava a turma numa segunda-feira
-- abria a chamada do domingo (a data sugerida) e via a lista vazia: os
-- alunos só valiam a partir de segunda. É o caminho normal de quem está
-- começando — e de quem matricula na semana o visitante que veio domingo.
--
-- Agora a PRIMEIRA matrícula de uma pessoa começa no domingo mais recente
-- (o próprio dia, se for domingo). Mudança de classe continua como era:
-- encerra a anterior ontem e começa a nova hoje, para a pessoa não ficar em
-- duas classes no mesmo domingo.

-- Domingo mais recente no fuso do Brasil (hoje, se hoje for domingo).
create or replace function public.ebd_domingo_da_semana()
returns date
language sql
stable
set search_path = public
as $$
  select d - extract(dow from d)::int
  from (select (now() at time zone 'America/Sao_Paulo')::date as d) hoje;
$$;

revoke all on function public.ebd_domingo_da_semana() from public, anon, authenticated;
grant execute on function public.ebd_domingo_da_semana() to authenticated;

create or replace function public.ebd_matricular(p_classe_id uuid, p_membro_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classe public.ebd_classes%rowtype;
  v_id uuid;
  v_primeira boolean;
begin
  select * into v_classe from public.ebd_classes where id = p_classe_id and deleted_at is null and ativa;
  if v_classe.id is null or not public.can_gerir_ebd(v_classe.church_id) then
    raise exception 'classe nao encontrada' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.rol_membros where id = p_membro_id and church_id = v_classe.church_id and deleted_at is null
  ) then
    raise exception 'pessoa de outra igreja' using errcode = 'check_violation';
  end if;

  select id into v_id from public.ebd_matriculas where membro_id = p_membro_id and ate is null and classe_id = p_classe_id;
  if v_id is not null then
    return v_id; -- já está nesta classe
  end if;

  -- Nunca foi aluno de nenhuma classe: vale desde o domingo da semana.
  v_primeira := not exists (select 1 from public.ebd_matriculas where membro_id = p_membro_id);

  update public.ebd_matriculas
  set ate = greatest(desde, current_date - 1)
  where membro_id = p_membro_id and ate is null;

  insert into public.ebd_matriculas (classe_id, membro_id, church_id, desde)
  values (p_classe_id, p_membro_id, v_classe.church_id,
          case when v_primeira then public.ebd_domingo_da_semana() else current_date end)
  returning id into v_id;
  return v_id;
end;
$$;

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

  insert into public.rol_membros (church_id, nome, whatsapp, nascimento, membro_igreja, participa_chamada)
  values (v_classe.church_id, trim(p_nome), nullif(trim(coalesce(p_telefone, '')), ''), p_nascimento, false, false)
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

notify pgrst, 'reload schema';
