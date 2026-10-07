-- Código da página por REDE.
--
-- Até aqui `churches.public_code` era único no sistema inteiro: se uma rede
-- cadastrasse "lins", nenhuma outra podia. Agora cada igreja tem um `codigo`
-- que só precisa ser único DENTRO da rede dela, e o endereço completo é:
--
--   igreja do topo (sede, ou igreja sem rede):  /igreja/{codigo}
--   igreja abaixo de outra:                      /igreja/{codigo da sede}/{codigo}
--
-- O código da sede é, portanto, o identificador da rede.
--
-- `public_code` CONTINUA existindo e continua único no sistema: passa a ser a
-- CHAVE montada pelo banco ("adipiranga" para a sede, "adipiranga~lins" para a
-- filial). É ela que as rotas, o patrocínio, o QR Code e o domínio próprio já
-- usam para achar a igreja — por isso nada disso precisou mudar. O "~" nunca
-- aparece no endereço: o proxy troca /igreja/adipiranga/lins pela chave.
--
-- Quem escreve é um gatilho. A aplicação segue gravando `public_code` como
-- antes (o código que a pessoa digitou); o gatilho entende isso como "mudar o
-- código" e monta a chave.

alter table public.churches add column if not exists codigo text;

update public.churches set codigo = public_code where codigo is null;

alter table public.churches
  alter column codigo set not null,
  add constraint churches_codigo_formato check (
    codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and char_length(codigo) between 3 and 40
    -- Palavras que são subpáginas de /igreja/{codigo}/...
    and codigo not in ('eventos', 'campanhas')
  );

-- A chave agora aceita UMA parte de rede na frente.
alter table public.churches drop constraint churches_public_code_formato;
alter table public.churches add constraint churches_public_code_formato check (
  public_code ~ '^[a-z0-9]+(-[a-z0-9]+)*(~[a-z0-9]+(-[a-z0-9]+)*)?$'
  and char_length(public_code) between 3 and 81
);

-- ---------------------------------------------------------------------------
-- Monta a chave a partir do código e da posição na rede
-- ---------------------------------------------------------------------------
create or replace function public.churches_monta_chave_publica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefixo text := '';
  v_base text;
  v_chave text;
  v_escolhido boolean;
  n int := 1;
begin
  if tg_op = 'INSERT' then
    -- Cadastro pelo caminho antigo: veio só `public_code`.
    if new.codigo is null then new.codigo := new.public_code; end if;
    v_escolhido := true;
  else
    -- A aplicação grava o código novo em `public_code`: é uma troca de código.
    if new.public_code is distinct from old.public_code and new.codigo is not distinct from old.codigo then
      new.codigo := new.public_code;
    end if;
    v_escolhido := new.codigo is distinct from old.codigo;
  end if;

  if new.parent_id is not null then
    select c.codigo || '~' into v_prefixo
    from public.churches c
    where c.id = public.igreja_do_topo(new.parent_id);
  end if;

  v_base := new.codigo;
  loop
    v_chave := coalesce(v_prefixo, '') || new.codigo;
    exit when not exists (select 1 from public.churches c where c.public_code = v_chave and c.id <> new.id);
    -- Código que a pessoa ESCOLHEU e já existe: o índice único recusa (23505)
    -- e a tela pede outro. Colisão por ter ENTRADO ou SAÍDO de uma rede não
    -- pode travar o vínculo: o código ganha um número no fim.
    exit when v_escolhido;
    n := n + 1;
    new.codigo := left(v_base, 36) || '-' || n;
  end loop;

  new.public_code := v_chave;
  return new;
end;
$$;

revoke all on function public.churches_monta_chave_publica() from public, anon, authenticated;

create trigger churches_monta_chave_publica
  before insert or update of codigo, public_code, parent_id on public.churches
  for each row
  execute function public.churches_monta_chave_publica();

-- A igreja mudou de código ou de lugar: quem está abaixo dela tem a chave
-- refeita (o "update ... set parent_id = parent_id" só serve para acionar o
-- gatilho acima em cada filha, que por sua vez aciona este nas netas).
create or replace function public.churches_propaga_chave_publica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.churches set parent_id = parent_id where parent_id = new.id;
  return null;
end;
$$;

revoke all on function public.churches_propaga_chave_publica() from public, anon, authenticated;

create trigger churches_propaga_chave_publica
  after update of codigo, public_code, parent_id on public.churches
  for each row
  when (old.public_code is distinct from new.public_code or old.parent_id is distinct from new.parent_id)
  execute function public.churches_propaga_chave_publica();

-- ---------------------------------------------------------------------------
-- Igrejas que já existem: quem está abaixo de outra ganha a chave com a rede
-- ---------------------------------------------------------------------------
-- Do topo para baixo, para a sede já estar certa quando chegar a vez das filhas.
do $$
declare r record;
begin
  for r in
    select c.id from public.churches c where c.parent_id is not null order by nlevel(c.path), c.created_at
  loop
    update public.churches set parent_id = parent_id where id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Endereço antigo: /igreja/{codigo} de uma igreja que hoje está numa rede
-- ---------------------------------------------------------------------------
-- Devolve a chave atual quando o código antigo aponta para UMA igreja só
-- (link já compartilhado ou QR impresso). Com mais de uma, não há o que
-- adivinhar: não devolve nada e a página responde "não encontrada".
create or replace function public.chave_publica_por_codigo(p_codigo text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select min(c.public_code)
  from public.churches c
  where c.codigo = p_codigo and c.deleted_at is null
  having count(*) = 1;
$$;

revoke all on function public.chave_publica_por_codigo(text) from public, anon, authenticated;
grant execute on function public.chave_publica_por_codigo(text) to anon, authenticated;

notify pgrst, 'reload schema';
