-- Página da sede: um texto de apresentação ("Sobre") e a lista das igrejas
-- ligadas a ela, que fica numa TELA PRÓPRIA (um ministério pode ter centenas).
--
-- A sede NÃO mostra eventos nem campanhas das outras igrejas: misturar o
-- conteúdo de várias igrejas numa página confunde quem visita. Quem quer ver
-- o que acontece em outra igreja abre a página dela pela lista.
--
-- A função é SECURITY DEFINER porque a página é aberta sem login e o anon não
-- lê `churches.tipo`, mas devolve SÓ o que já é público na página de cada
-- igreja (nome, endereço), e só para uma igreja do topo — chamada com uma
-- filial, não devolve nada.

-- ---------------------------------------------------------------------------
-- "Sobre": texto de apresentação, de qualquer igreja
-- ---------------------------------------------------------------------------
alter table public.churches
  add column if not exists sobre text
  check (sobre is null or char_length(sobre) between 1 and 1500);

-- `churches` tem GRANTs por coluna: escrever é de quem administra (policy
-- churches_update_company_admin); ler é público, como o resto da página.
grant update (sobre) on public.churches to authenticated;
grant select (sobre) on public.churches to anon;

-- ---------------------------------------------------------------------------
-- Igrejas da rede
-- ---------------------------------------------------------------------------
-- A lista tem tela própria, /igreja/{sede}/igrejas: "igrejas" passa a ser
-- subpágina e deixa de poder ser código de igreja (como eventos e campanhas).
alter table public.churches drop constraint churches_codigo_formato;
alter table public.churches add constraint churches_codigo_formato check (
  codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  and char_length(codigo) between 3 and 40
  and codigo not in ('eventos', 'campanhas', 'igrejas')
);

create or replace function public.rede_igrejas_publicas(p_church_id uuid)
returns table (
  id uuid,
  name text,
  sobrenome text,
  address text,
  public_code text,
  tipo text,
  logo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.sobrenome, c.address, c.public_code, c.tipo, c.logo_url
  from public.churches s
  join public.churches c on c.path <@ s.path and c.id <> s.id
  where s.id = p_church_id and s.parent_id is null and s.deleted_at is null
    and c.deleted_at is null
  order by c.name
  limit 1000;
$$;

revoke all on function public.rede_igrejas_publicas(uuid) from public, anon, authenticated;
grant execute on function public.rede_igrejas_publicas(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
