-- Nomes dos níveis da rede de igrejas, configuráveis pela sede.
--
-- A ESTRUTURA continua fixa em três níveis (churches.tipo: sede, subsede,
-- congregacao) — herança, vínculos e permissões não mudam. O que muda é o NOME
-- que cada rede dá a eles: "Sede / Subsede / Congregação" é só o padrão; outra
-- denominação pode chamar de "Igreja-mãe / Filial / Ponto de pregação".
--
-- Uma linha por rede, guardada na igreja do topo (a sede). Sem linha = nomes
-- padrão, que ficam no código (src/lib/niveisRede.ts), não aqui.

create table public.rede_nomes_niveis (
  -- A sede da rede.
  church_id uuid primary key references public.churches (id) on delete cascade,
  company_id uuid not null references public.companies (id),
  sede_singular text not null check (char_length(sede_singular) between 2 and 30),
  sede_plural text not null check (char_length(sede_plural) between 2 and 30),
  subsede_singular text not null check (char_length(subsede_singular) between 2 and 30),
  subsede_plural text not null check (char_length(subsede_plural) between 2 and 30),
  congregacao_singular text not null check (char_length(congregacao_singular) between 2 and 30),
  congregacao_plural text not null check (char_length(congregacao_plural) between 2 and 30),
  atualizado_por uuid references auth.users (id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rede_nomes_niveis_company_idx on public.rede_nomes_niveis (company_id);

-- Ninguém lê nem escreve a tabela direto: a leitura precisa subir a árvore até
-- a sede (o que a RLS de quem está embaixo não deixaria) e a escrita é só do
-- Responsável da sede. Tudo passa pelas duas funções abaixo.
alter table public.rede_nomes_niveis enable row level security;
revoke all on public.rede_nomes_niveis from public, anon, authenticated;

-- A igreja do topo da árvore de `p_church_id` (ela mesma, se não tem superior).
create or replace function public.igreja_do_topo(p_church_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive acima as (
    select c.id, c.parent_id, 0 as nivel from public.churches c where c.id = p_church_id
    union all
    select p.id, p.parent_id, a.nivel + 1
    from acima a
    join public.churches p on p.id = a.parent_id
    -- Três níveis hoje; o limite só protege contra um ciclo por dado corrompido.
    where a.nivel < 10
  )
  select id from acima where parent_id is null limit 1;
$$;

revoke all on function public.igreja_do_topo(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ler: os nomes que valem para a rede desta igreja
-- ---------------------------------------------------------------------------
-- Aberto também para quem não está logado: são só os rótulos que a página de
-- convite de vínculo e as páginas públicas mostram. Nenhuma linha = padrão.
create or replace function public.nomes_dos_niveis(p_church_id uuid)
returns table (
  sede_singular text,
  sede_plural text,
  subsede_singular text,
  subsede_plural text,
  congregacao_singular text,
  congregacao_plural text
)
language sql
stable
security definer
set search_path = public
as $$
  select n.sede_singular, n.sede_plural, n.subsede_singular, n.subsede_plural,
         n.congregacao_singular, n.congregacao_plural
  from public.rede_nomes_niveis n
  where n.church_id = public.igreja_do_topo(p_church_id)
    and n.deleted_at is null;
$$;

revoke all on function public.nomes_dos_niveis(uuid) from public, anon, authenticated;
grant execute on function public.nomes_dos_niveis(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gravar: só o Responsável (owner) da SEDE
-- ---------------------------------------------------------------------------
-- `p_nomes` null devolve a rede aos nomes padrão. Igreja sem superior que não
-- é sede (cadastrada sozinha) usa o padrão: ao entrar numa rede, passa a
-- seguir os nomes da sede dela.
create or replace function public.salvar_nomes_dos_niveis(p_church_id uuid, p_nomes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_igreja public.churches%rowtype;
begin
  select * into v_igreja from public.churches where id = p_church_id and deleted_at is null;
  -- Mesma resposta para "não existe" e "não é sua".
  if v_igreja.id is null or v_igreja.company_id is null or not public.is_company_owner(v_igreja.company_id) then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;
  if v_igreja.tipo <> 'sede' or v_igreja.parent_id is not null then
    raise exception 'só a sede define os nomes dos níveis da rede' using errcode = '42501';
  end if;

  if p_nomes is null or jsonb_typeof(p_nomes) = 'null' then
    update public.rede_nomes_niveis
       set deleted_at = now(), atualizado_por = auth.uid(), updated_at = now()
     where church_id = p_church_id and deleted_at is null;
    return;
  end if;

  -- Texto faltando vira NULL e para no NOT NULL (23502); fora do tamanho, no CHECK (23514).
  insert into public.rede_nomes_niveis as n (
    church_id, company_id,
    sede_singular, sede_plural, subsede_singular, subsede_plural,
    congregacao_singular, congregacao_plural, atualizado_por
  ) values (
    p_church_id, v_igreja.company_id,
    nullif(btrim(p_nomes->>'sede_singular'), ''),
    nullif(btrim(p_nomes->>'sede_plural'), ''),
    nullif(btrim(p_nomes->>'subsede_singular'), ''),
    nullif(btrim(p_nomes->>'subsede_plural'), ''),
    nullif(btrim(p_nomes->>'congregacao_singular'), ''),
    nullif(btrim(p_nomes->>'congregacao_plural'), ''),
    auth.uid()
  )
  on conflict (church_id) do update set
    sede_singular = excluded.sede_singular,
    sede_plural = excluded.sede_plural,
    subsede_singular = excluded.subsede_singular,
    subsede_plural = excluded.subsede_plural,
    congregacao_singular = excluded.congregacao_singular,
    congregacao_plural = excluded.congregacao_plural,
    atualizado_por = excluded.atualizado_por,
    deleted_at = null,
    updated_at = now();
end;
$$;

revoke all on function public.salvar_nomes_dos_niveis(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_nomes_dos_niveis(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
