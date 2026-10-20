-- ---------------------------------------------------------------------------
-- EBD: números da rede e títulos de lição por classe
-- ---------------------------------------------------------------------------
-- 1. REDE: a igreja de cima (sede, subsede) vê a EBD das de baixo só em
--    NÚMEROS — classes, matriculados, último domingo, presença. Nada de
--    nomes, responsáveis ou cuidados (LGPD), igual ao resumo da chamada.
--    Vê quem administra a igreja de cima ou é da secretaria da EBD dela.
--
-- 2. TÍTULOS POR CLASSE: cada classe pode usar outra revista (Adultos,
--    Juniores...). A numeração das lições do trimestre é uma só; o título
--    pode ser da classe. A chamada usa o da classe e, sem ele, o geral.

-- ---------------------------------------------------------------------------
-- 1. Resumo da EBD da rede
-- ---------------------------------------------------------------------------
create or replace function public.ebd_resumo_rede(p_church_id uuid)
returns table (
  church_id uuid,
  church_name text,
  tipo text,
  classes int,
  matriculados int,
  ultimo_domingo date,
  presentes_ultimo int,
  visitantes_ultimo int,
  presenca_8_semanas numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.name, d.tipo,
         (select count(*) from public.ebd_classes k where k.church_id = d.id and k.deleted_at is null and k.ativa)::int,
         (select count(*) from public.ebd_matriculas mt
           join public.ebd_classes k on k.id = mt.classe_id and k.deleted_at is null and k.ativa
           where mt.church_id = d.id and mt.ate is null)::int,
         u.data,
         coalesce((select count(*) from public.ebd_presencas p join public.ebd_aulas a on a.id = p.aula_id
           where a.church_id = d.id and a.data = u.data and p.estado = 'presente'), 0)::int,
         coalesce((select count(*) from public.ebd_visitantes v join public.ebd_aulas a on a.id = v.aula_id
           where a.church_id = d.id and a.data = u.data), 0)::int,
         (select round(100.0 * count(*) filter (where p.estado = 'presente')
                       / nullif(count(*) filter (where p.estado in ('presente', 'ausente')), 0), 1)
          from public.ebd_presencas p join public.ebd_aulas a on a.id = p.aula_id
          where a.church_id = d.id and a.data >= current_date - 56)
  from public.churches raiz
  join public.churches d on d.path <@ raiz.path and d.id <> raiz.id and d.deleted_at is null
  left join lateral (
    select max(a.data) as data from public.ebd_aulas a where a.church_id = d.id
  ) u on true
  where raiz.id = p_church_id
    and raiz.deleted_at is null
    and (public.can_admin_view_church(raiz.id) or public.can_gerir_ebd(raiz.id))
  order by d.path;
$$;

revoke all on function public.ebd_resumo_rede(uuid) from public, anon, authenticated;
grant execute on function public.ebd_resumo_rede(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Título da lição por classe
-- ---------------------------------------------------------------------------
create table if not exists public.ebd_licao_titulos (
  licao_id uuid not null references public.ebd_licoes (id) on delete cascade,
  classe_id uuid not null references public.ebd_classes (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 160),
  primary key (licao_id, classe_id)
);

drop trigger if exists set_ebd_licao_titulos_company_id on public.ebd_licao_titulos;
create trigger set_ebd_licao_titulos_company_id
  before insert or update of church_id on public.ebd_licao_titulos
  for each row execute function public.set_company_id_from_church();

create or replace function public.ebd_confere_licao_titulo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.ebd_licoes where id = new.licao_id and church_id = new.church_id)
     or not exists (select 1 from public.ebd_classes where id = new.classe_id and church_id = new.church_id) then
    raise exception 'licao ou classe de outra igreja' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.ebd_confere_licao_titulo() from public, anon, authenticated;
drop trigger if exists ebd_licao_titulos_confere on public.ebd_licao_titulos;
create trigger ebd_licao_titulos_confere
  before insert or update on public.ebd_licao_titulos
  for each row execute function public.ebd_confere_licao_titulo();

alter table public.ebd_licao_titulos enable row level security;
revoke all on public.ebd_licao_titulos from anon, authenticated;
grant select, delete on public.ebd_licao_titulos to authenticated;
grant insert (licao_id, classe_id, church_id, titulo) on public.ebd_licao_titulos to authenticated;
grant update (titulo) on public.ebd_licao_titulos to authenticated;

-- Lê quem cuida da classe; escreve a gestão.
drop policy if exists ebd_licao_titulos_select on public.ebd_licao_titulos;
create policy ebd_licao_titulos_select on public.ebd_licao_titulos for select to authenticated
  using (public.can_ebd_classe(classe_id));
drop policy if exists ebd_licao_titulos_insert on public.ebd_licao_titulos;
create policy ebd_licao_titulos_insert on public.ebd_licao_titulos for insert to authenticated
  with check (public.can_gerir_ebd(church_id));
drop policy if exists ebd_licao_titulos_update on public.ebd_licao_titulos;
create policy ebd_licao_titulos_update on public.ebd_licao_titulos for update to authenticated
  using (public.can_gerir_ebd(church_id)) with check (public.can_gerir_ebd(church_id));
drop policy if exists ebd_licao_titulos_delete on public.ebd_licao_titulos;
create policy ebd_licao_titulos_delete on public.ebd_licao_titulos for delete to authenticated
  using (public.can_gerir_ebd(church_id));

notify pgrst, 'reload schema';
