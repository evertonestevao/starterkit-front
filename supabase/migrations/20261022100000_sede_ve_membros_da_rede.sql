-- Sede/subsede passam a ver o cadastro completo dos membros das igrejas
-- abaixo na mesma rede — reversão intencional e restrita da regra "nunca
-- pessoas, só números" (ver 20261001100000_acompanhamento.sql,
-- 20261006200000_membros_dados_reservados.sql), decidida pelo Everton em
-- 2026-10-17.
--
-- Três condições, todas obrigatórias:
--   1. quem lê administra (owner/admin) uma igreja ACIMA na árvore
--      (can_admin_view_church, já existente — mesma régua de patrocínio);
--   2. a pessoa é membro de fato (rol_membros.membro_igreja) — congregado,
--      criança ou aluno da EBD que ainda não é membro fica de fora;
--   3. a pessoa assinou o termo de consentimento do cadastro
--      (rol_membro_consentimentos.cadastro) — sem isso, nem sendo membro.
--
-- rol_membros.cuidados (saúde de criança da EBD) continua NUNCA saindo da
-- própria igreja — regra própria, mais específica, mantida à parte.
--
-- O que NÃO muda: chamadas, chamada_presencas, chamada_visitantes,
-- justificativas, acompanhamento_contatos, acompanhamento_config,
-- ebd_contatos, visita_participantes — nenhuma dessas policies é tocada
-- aqui, continuam só can_acompanhar (própria igreja).

-- ---------------------------------------------------------------------------
-- 1. Helper único com as duas condições extras (membro de fato + termo
--    assinado), por cima de can_admin_view_church.
-- ---------------------------------------------------------------------------
create or replace function public.pode_rede_ver_cadastro(p_membro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rol_membros m
    join public.rol_membro_consentimentos c
      on c.membro_id = m.id and c.deleted_at is null
    where m.id = p_membro_id
      and m.deleted_at is null
      and m.membro_igreja
      and c.cadastro
      and public.can_admin_view_church(m.church_id)
  );
$$;

revoke all on function public.pode_rede_ver_cadastro(uuid) from public, anon, authenticated;
grant execute on function public.pode_rede_ver_cadastro(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. rol_membros: a policy do loop de acompanhamento ganha o OR. Recriada só
--    para esta tabela — as outras 6 do loop original (justificativas,
--    chamadas, chamada_presencas, chamada_visitantes,
--    acompanhamento_contatos, acompanhamento_config) ficam como estavam.
-- ---------------------------------------------------------------------------
drop policy if exists rol_membros_select_own on public.rol_membros;
create policy rol_membros_select_own on public.rol_membros for select to authenticated
  using (public.can_acompanhar(church_id) or public.pode_rede_ver_cadastro(id));

-- ---------------------------------------------------------------------------
-- 3. rol_membros_reservado: mesma regra, e `cuidados` nunca sai da própria
--    igreja (fica null quando é só a rede que está lendo).
-- ---------------------------------------------------------------------------
create or replace view public.rol_membros_reservado
with (security_barrier = true) as
  select
    m.id, m.church_id, m.email, m.nascimento, m.batismo, m.observacoes,
    case when public.tem_acesso(m.company_id, 'membros') then m.cuidados else null end as cuidados
  from public.rol_membros m
  where m.deleted_at is null
    and (public.tem_acesso(m.company_id, 'membros') or public.pode_rede_ver_cadastro(m.id));

-- ---------------------------------------------------------------------------
-- 4. Ficha, histórico, consentimento e carteirinha: mesmo OR, via membro_id.
-- ---------------------------------------------------------------------------
drop policy if exists "rol_membro_fichas_select" on public.rol_membro_fichas;
create policy "rol_membro_fichas_select" on public.rol_membro_fichas
  for select to authenticated
  using (
    deleted_at is null
    and (public.tem_acesso(company_id, 'membros') or public.pode_rede_ver_cadastro(membro_id))
  );

drop policy if exists "rol_membro_historico_select" on public.rol_membro_historico;
create policy "rol_membro_historico_select" on public.rol_membro_historico
  for select to authenticated
  using (
    deleted_at is null
    and (public.tem_acesso(company_id, 'membros') or public.pode_rede_ver_cadastro(membro_id))
  );

drop policy if exists "rol_membro_consentimentos_select" on public.rol_membro_consentimentos;
create policy "rol_membro_consentimentos_select" on public.rol_membro_consentimentos
  for select to authenticated
  using (
    deleted_at is null
    and (public.tem_acesso(company_id, 'membros') or public.pode_rede_ver_cadastro(membro_id))
  );

drop policy if exists "rol_membro_carteirinhas_select" on public.rol_membro_carteirinhas;
create policy "rol_membro_carteirinhas_select" on public.rol_membro_carteirinhas
  for select to authenticated
  using (
    deleted_at is null
    and (public.tem_acesso(company_id, 'membros') or public.pode_rede_ver_cadastro(membro_id))
  );

-- ---------------------------------------------------------------------------
-- 5. Números agregados para a sede, sem exigir consentimento (número, não
--    pessoa — mesma régua de rede_painel_unidades). Mostra quantos faltam
--    aceitar o termo, para a tela de Membros da rede.
-- ---------------------------------------------------------------------------
create or replace function public.rede_membros_kpis(p_church_id uuid)
returns table (membros_total int, membros_sem_consentimento int)
language sql
stable
security definer
set search_path = public
as $$
  -- O "where" de permissão fica FORA do agregado de propósito: um count(*)
  -- sem group by sempre devolve uma linha (zeros), mesmo filtrando tudo. Isso
  -- faria "sem permissão" parecer igual a "igreja com zero membros". Filtrando
  -- a linha já agregada, quem não administra a igreja de cima recebe
  -- nenhuma linha (null), não zeros.
  select k.membros_total, k.membros_sem_consentimento
  from (
    select
      count(*) filter (where m.membro_igreja)::int as membros_total,
      count(*) filter (where m.membro_igreja and coalesce(c.cadastro, false) = false)::int as membros_sem_consentimento
    from public.rol_membros m
    left join public.rol_membro_consentimentos c
      on c.membro_id = m.id and c.deleted_at is null
    where m.church_id = p_church_id
      and m.deleted_at is null
  ) k
  where public.can_admin_view_church(p_church_id);
$$;

revoke all on function public.rede_membros_kpis(uuid) from public, anon, authenticated;
grant execute on function public.rede_membros_kpis(uuid) to authenticated;

notify pgrst, 'reload schema';
