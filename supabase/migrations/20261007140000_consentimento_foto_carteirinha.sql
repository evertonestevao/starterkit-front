-- Consentimento do membro (LGPD), foto e carteirinha.
--
-- Filiação religiosa é dado pessoal sensível: a base aqui é o consentimento do
-- membro, assinado num termo em papel que a igreja arquiva. O sistema guarda o
-- QUE foi consentido — separado por finalidade — e obedece:
--   * sem "foto" no termo, a foto não entra;
--   * sem "carteirinha" no termo, a carteirinha não é emitida;
--   * tirar um consentimento apaga a foto / cancela a carteirinha na hora.
--
-- Carteirinha: duas chaves diferentes, de propósito.
--   * `codigo` vai no QR Code. Quem lê cai na página de verificação, que mostra
--     o mínimo (nome, igreja, se está válida). Não muda quando o link é trocado,
--     então a carteirinha impressa continua valendo.
--   * o link pessoal (token) abre a carteirinha inteira, com foto. O banco
--     guarda só o hash; se o link vazar, a secretaria gera outro.
--
-- A foto fica num bucket PRIVADO sem policy nenhuma: ninguém lê pela API. Quem
-- entrega a imagem é o servidor, depois de conferir o acesso.

-- O histórico ganha os dois tipos novos.
alter table public.rol_membro_historico drop constraint rol_membro_historico_tipo_check;
alter table public.rol_membro_historico add constraint rol_membro_historico_tipo_check check (
  tipo in ('cadastro', 'situacao', 'documento', 'anotacao', 'consentimento', 'carteirinha')
);

-- ---------------------------------------------------------------------------
-- 1. Consentimento (e a foto, que só existe com ele)
-- ---------------------------------------------------------------------------
create table public.rol_membro_consentimentos (
  membro_id uuid primary key references public.rol_membros (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Uma finalidade por coluna: aceitar o cadastro não é aceitar a foto.
  cadastro boolean not null default false,
  foto boolean not null default false,
  carteirinha boolean not null default false,
  -- Data da assinatura no papel.
  assinado_em date,
  -- Menor de idade: quem assinou por ele.
  responsavel_nome text check (responsavel_nome is null or char_length(responsavel_nome) between 2 and 120),
  foto_path text,
  foto_em timestamptz,
  registrado_por uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Foto e carteirinha pressupõem o consentimento do cadastro.
  constraint rol_membro_consentimentos_coerente check (cadastro or (not foto and not carteirinha)),
  constraint rol_membro_consentimentos_assinado check (not cadastro or assinado_em is not null),
  constraint rol_membro_consentimentos_foto check (foto or foto_path is null)
);

create index rol_membro_consentimentos_church_idx on public.rol_membro_consentimentos (church_id);
create index rol_membro_consentimentos_company_idx on public.rol_membro_consentimentos (company_id);

alter table public.rol_membro_consentimentos enable row level security;

-- Tabela nova nasce com ALL para anon/authenticated: tira tudo e devolve só a leitura.
revoke all on public.rol_membro_consentimentos from public, anon, authenticated;
grant select on public.rol_membro_consentimentos to authenticated;

create policy "rol_membro_consentimentos_select" on public.rol_membro_consentimentos
  for select to authenticated
  using (deleted_at is null and public.tem_acesso(company_id, 'membros'));

-- ---------------------------------------------------------------------------
-- 2. Carteirinha
-- ---------------------------------------------------------------------------
create table public.rol_membro_carteirinhas (
  membro_id uuid primary key references public.rol_membros (id) on delete cascade,
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[0-9A-F]{16}$'),
  -- Só o hash do link pessoal. Nulo = sem link válido.
  token_hash text unique,
  validade date not null,
  emitida_em timestamptz not null default now(),
  emitida_por uuid references auth.users (id) on delete set null,
  revogada_em timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rol_membro_carteirinhas_company_idx on public.rol_membro_carteirinhas (company_id);

alter table public.rol_membro_carteirinhas enable row level security;

revoke all on public.rol_membro_carteirinhas from public, anon, authenticated;
-- O hash do link não é concedido: nem quem tem o módulo o lê.
grant select (membro_id, church_id, company_id, codigo, validade, emitida_em, revogada_em, deleted_at)
  on public.rol_membro_carteirinhas to authenticated;

create policy "rol_membro_carteirinhas_select" on public.rol_membro_carteirinhas
  for select to authenticated
  using (deleted_at is null and public.tem_acesso(company_id, 'membros'));

-- Bucket privado das fotos. Sem policy em storage.objects: só o servidor
-- (service_role) lê e escreve. JPEG e PNG: é o que o PDF da carteirinha aceita.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('membros-fotos', 'membros-fotos', false, 1048576, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Registrar o termo
-- ---------------------------------------------------------------------------
-- Devolve o caminho da foto que deve ser APAGADA do bucket (quando o
-- consentimento da foto saiu), ou nulo.
create or replace function public.salvar_consentimento_membro(p_membro_id uuid, p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membro public.rol_membros%rowtype;
  v_cadastro boolean := coalesce((p ->> 'cadastro')::boolean, false);
  v_foto boolean := coalesce((p ->> 'foto')::boolean, false);
  v_cart boolean := coalesce((p ->> 'carteirinha')::boolean, false);
  v_assinado date := nullif(btrim(coalesce(p ->> 'assinado_em', '')), '')::date;
  v_resp text := nullif(btrim(coalesce(p ->> 'responsavel_nome', '')), '');
  v_foto_antiga text;
  v_apagar text;
begin
  select * into v_membro from public.rol_membros where id = p_membro_id and deleted_at is null;
  -- Mesma resposta para "não existe" e "não é da sua igreja".
  if v_membro.id is null or v_membro.company_id is null or not public.tem_acesso(v_membro.company_id, 'membros') then
    raise exception 'membro não encontrado' using errcode = 'P0002';
  end if;

  -- Sem o cadastro, nada mais vale.
  if not v_cadastro then
    v_foto := false;
    v_cart := false;
    v_assinado := null;
    v_resp := null;
  elsif v_assinado is null or v_assinado > public.hoje_local() then
    raise exception 'informe a data em que o termo foi assinado' using errcode = '22023';
  end if;

  select foto_path into v_foto_antiga from public.rol_membro_consentimentos where membro_id = p_membro_id;
  if not v_foto then v_apagar := v_foto_antiga; end if;

  insert into public.rol_membro_consentimentos as c
    (membro_id, church_id, company_id, cadastro, foto, carteirinha, assinado_em, responsavel_nome, registrado_por)
  values
    (p_membro_id, v_membro.church_id, v_membro.company_id, v_cadastro, v_foto, v_cart, v_assinado, v_resp, auth.uid())
  on conflict (membro_id) do update set
    cadastro = excluded.cadastro,
    foto = excluded.foto,
    carteirinha = excluded.carteirinha,
    assinado_em = excluded.assinado_em,
    responsavel_nome = excluded.responsavel_nome,
    foto_path = case when excluded.foto then c.foto_path else null end,
    foto_em = case when excluded.foto then c.foto_em else null end,
    registrado_por = excluded.registrado_por,
    deleted_at = null,
    updated_at = now();

  -- Sem consentimento para a carteirinha, ela é cancelada e o link morre.
  if not v_cart then
    update public.rol_membro_carteirinhas
       set revogada_em = now(), token_hash = null, updated_at = now()
     where membro_id = p_membro_id and revogada_em is null;
  end if;

  insert into public.rol_membro_historico (membro_id, church_id, company_id, tipo, titulo, detalhe, data, registrado_por)
  values (
    p_membro_id, v_membro.church_id, v_membro.company_id, 'consentimento',
    case when v_cadastro then 'Termo de consentimento registrado' else 'Consentimento retirado' end,
    case when v_cadastro then
      'Cadastro: sim · Foto: ' || case when v_foto then 'sim' else 'não' end
      || ' · Carteirinha: ' || case when v_cart then 'sim' else 'não' end
    end,
    coalesce(v_assinado, public.hoje_local()),
    auth.uid()
  );

  return v_apagar;
end;
$$;

-- Liga (ou tira) a foto do membro. O arquivo já foi enviado pelo servidor; o
-- caminho tem de ser o DESTE membro, para ninguém apontar para a foto de outro.
-- Devolve o caminho anterior, para o servidor apagar o arquivo antigo.
create or replace function public.definir_foto_membro(p_membro_id uuid, p_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.rol_membro_consentimentos%rowtype;
begin
  select * into v_c from public.rol_membro_consentimentos
   where membro_id = p_membro_id and deleted_at is null
   for update;
  if v_c.membro_id is null or not public.tem_acesso(v_c.company_id, 'membros') then
    -- Sem termo registrado também cai aqui: sem consentimento não há foto.
    raise exception 'membro sem consentimento registrado' using errcode = 'P0002';
  end if;

  if p_path is not null then
    if not v_c.foto then
      raise exception 'o membro não consentiu com o uso da foto' using errcode = '42501';
    end if;
    if p_path !~ ('^' || v_c.company_id::text || '/' || p_membro_id::text || '/[0-9a-f-]{36}\.(jpg|png)$') then
      raise exception 'caminho de foto inválido' using errcode = '22023';
    end if;
  end if;

  update public.rol_membro_consentimentos
     set foto_path = p_path, foto_em = case when p_path is null then null else now() end, updated_at = now()
   where membro_id = p_membro_id;
  return v_c.foto_path;
end;
$$;

-- Quem ainda não tem termo (para a secretaria ir colhendo as assinaturas).
create or replace function public.membros_sem_consentimento(p_church_id uuid)
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.nome
  from public.rol_membros m
  join public.churches c on c.id = m.church_id and c.deleted_at is null
  where m.church_id = p_church_id
    and m.deleted_at is null
    and m.ativo
    and c.company_id is not null
    and public.tem_acesso(c.company_id, 'membros')
    and not exists (
      select 1 from public.rol_membro_consentimentos s
      where s.membro_id = m.id and s.deleted_at is null and s.cadastro
    )
  order by m.nome
  limit 5000;
$$;

-- ---------------------------------------------------------------------------
-- 4. Emitir e cancelar a carteirinha
-- ---------------------------------------------------------------------------
create or replace function public.emitir_carteirinha(p_membro_id uuid, p_token_hash text, p_validade date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membro public.rol_membros%rowtype;
  v_codigo text;
  v_renovacao boolean;
begin
  select * into v_membro from public.rol_membros where id = p_membro_id and deleted_at is null;
  if v_membro.id is null or v_membro.company_id is null or not public.tem_acesso(v_membro.company_id, 'membros') then
    raise exception 'membro não encontrado' using errcode = 'P0002';
  end if;
  -- Já havia uma em vigor: é renovação (ou só um link novo).
  select exists (
    select 1 from public.rol_membro_carteirinhas k
    where k.membro_id = p_membro_id and k.deleted_at is null and k.revogada_em is null
  ) into v_renovacao;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token inválido' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.rol_membro_consentimentos s
    where s.membro_id = p_membro_id and s.deleted_at is null and s.carteirinha
  ) then
    raise exception 'o membro não consentiu com a carteirinha' using errcode = '42501';
  end if;
  if not v_membro.ativo then
    raise exception 'só membro ativo recebe carteirinha' using errcode = '22023';
  end if;
  if p_validade is null or p_validade <= public.hoje_local() or p_validade > public.hoje_local() + 1830 then
    raise exception 'validade inválida' using errcode = '22023';
  end if;

  insert into public.rol_membro_carteirinhas as k
    (membro_id, church_id, company_id, codigo, token_hash, validade, emitida_por)
  values
    (p_membro_id, v_membro.church_id, v_membro.company_id,
     upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), p_token_hash, p_validade, auth.uid())
  on conflict (membro_id) do update set
    -- O código do QR não muda: a carteirinha já impressa continua valendo.
    token_hash = excluded.token_hash,
    validade = excluded.validade,
    emitida_em = now(),
    emitida_por = excluded.emitida_por,
    revogada_em = null,
    deleted_at = null,
    updated_at = now()
  returning k.codigo into v_codigo;

  insert into public.rol_membro_historico (membro_id, church_id, company_id, tipo, titulo, registrado_por)
  values (
    p_membro_id, v_membro.church_id, v_membro.company_id, 'carteirinha',
    case when v_renovacao then 'Carteirinha renovada' else 'Carteirinha emitida' end
      || ', válida até ' || to_char(p_validade, 'DD/MM/YYYY'),
    auth.uid()
  );
  return v_codigo;
end;
$$;

create or replace function public.revogar_carteirinha(p_membro_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_k public.rol_membro_carteirinhas%rowtype;
begin
  select * into v_k from public.rol_membro_carteirinhas
   where membro_id = p_membro_id and deleted_at is null and revogada_em is null
   for update;
  if v_k.membro_id is null or not public.tem_acesso(v_k.company_id, 'membros') then
    raise exception 'carteirinha não encontrada' using errcode = 'P0002';
  end if;
  update public.rol_membro_carteirinhas
     set revogada_em = now(), token_hash = null, updated_at = now()
   where membro_id = p_membro_id;
  insert into public.rol_membro_historico (membro_id, church_id, company_id, tipo, titulo, registrado_por)
  values (p_membro_id, v_k.church_id, v_k.company_id, 'carteirinha', 'Carteirinha cancelada', auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Ler a carteirinha
-- ---------------------------------------------------------------------------
-- Função interna (sem GRANT): os dados da carteirinha de um membro e se ela
-- vale hoje. As de fora decidem QUEM pode chamar.
create or replace function public.carteirinha_dados(p_membro_id uuid)
returns table (
  membro_id uuid,
  nome text,
  cargos text,
  igreja text,
  igreja_sobrenome text,
  pastor text,
  membro_desde date,
  validade date,
  codigo text,
  estado text,
  foto_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id, m.nome,
    (select string_agg(cg.nome, ', ' order by cg.ordem, cg.nome)
       from public.rol_membro_cargos rc
       join public.cargos cg on cg.id = rc.cargo_id and cg.deleted_at is null
      where rc.membro_id = m.id),
    c.name, c.sobrenome,
    (select p.nome
       from public.rol_membro_cargos rc
       join public.cargos cg on cg.id = rc.cargo_id and cg.slug = 'pastor'
       join public.rol_membros p on p.id = rc.membro_id and p.deleted_at is null and p.ativo
      where rc.church_id = c.id
      order by rc.desde desc
      limit 1),
    f.membro_desde,
    k.validade, k.codigo,
    case
      when k.revogada_em is not null or not coalesce(s.carteirinha, false) then 'cancelada'
      when not m.ativo then 'inativa'
      when k.validade < public.hoje_local() then 'vencida'
      else 'valida'
    end,
    case when coalesce(s.foto, false) then s.foto_path end
  from public.rol_membro_carteirinhas k
  join public.rol_membros m on m.id = k.membro_id and m.deleted_at is null
  join public.churches c on c.id = k.church_id and c.deleted_at is null
  left join public.rol_membro_fichas f on f.membro_id = m.id and f.deleted_at is null
  left join public.rol_membro_consentimentos s on s.membro_id = m.id and s.deleted_at is null
  where k.membro_id = p_membro_id and k.deleted_at is null;
$$;

-- Pela ficha (quem tem o módulo Membros).
create or replace function public.carteirinha_do_membro(p_membro_id uuid)
returns table (
  nome text, cargos text, igreja text, igreja_sobrenome text, pastor text,
  membro_desde date, validade date, codigo text, estado text, tem_foto boolean, tem_link boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select d.nome, d.cargos, d.igreja, d.igreja_sobrenome, d.pastor, d.membro_desde, d.validade, d.codigo, d.estado,
         d.foto_path is not null, k.token_hash is not null
  from public.rol_membro_carteirinhas k
  cross join lateral public.carteirinha_dados(k.membro_id) d
  where k.membro_id = p_membro_id
    and k.deleted_at is null
    and public.tem_acesso(k.company_id, 'membros');
$$;

-- Pelo link pessoal (sem login). Link cancelado ou de carteirinha cancelada
-- não devolve nada: para quem abre, a carteirinha não existe mais.
create or replace function public.carteirinha_por_token(p_token text)
returns table (
  nome text, cargos text, igreja text, igreja_sobrenome text, pastor text,
  membro_desde date, validade date, codigo text, estado text, tem_foto boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select d.nome, d.cargos, d.igreja, d.igreja_sobrenome, d.pastor, d.membro_desde, d.validade, d.codigo, d.estado,
         d.foto_path is not null
  from public.rol_membro_carteirinhas k
  cross join lateral public.carteirinha_dados(k.membro_id) d
  where k.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and k.deleted_at is null
    and d.estado <> 'cancelada';
$$;

-- O caminho da foto pelo link pessoal: só para o servidor, que entrega a imagem.
create or replace function public.carteirinha_foto_por_token(p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select d.foto_path
  from public.rol_membro_carteirinhas k
  cross join lateral public.carteirinha_dados(k.membro_id) d
  where k.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and k.deleted_at is null
    and d.estado <> 'cancelada';
$$;

-- Verificação pelo QR Code (sem login): o mínimo. Carteirinha cancelada ou de
-- quem não está mais ativo não mostra nem o nome — o consentimento pode ter
-- sido retirado.
create or replace function public.verificar_carteirinha(p_codigo text)
returns table (estado text, nome text, igreja text, igreja_sobrenome text, validade date)
language sql
stable
security definer
set search_path = public
as $$
  select d.estado,
         case when d.estado in ('valida', 'vencida') then d.nome end,
         d.igreja, d.igreja_sobrenome,
         case when d.estado in ('valida', 'vencida') then d.validade end
  from public.rol_membro_carteirinhas k
  cross join lateral public.carteirinha_dados(k.membro_id) d
  where k.codigo = upper(btrim(coalesce(p_codigo, '')))
    and k.deleted_at is null;
$$;

revoke all on function public.salvar_consentimento_membro(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.definir_foto_membro(uuid, text) from public, anon, authenticated;
revoke all on function public.membros_sem_consentimento(uuid) from public, anon, authenticated;
revoke all on function public.emitir_carteirinha(uuid, text, date) from public, anon, authenticated;
revoke all on function public.revogar_carteirinha(uuid) from public, anon, authenticated;
revoke all on function public.carteirinha_dados(uuid) from public, anon, authenticated;
revoke all on function public.carteirinha_do_membro(uuid) from public, anon, authenticated;
revoke all on function public.carteirinha_por_token(text) from public, anon, authenticated;
revoke all on function public.carteirinha_foto_por_token(text) from public, anon, authenticated;
revoke all on function public.verificar_carteirinha(text) from public, anon, authenticated;

grant execute on function public.salvar_consentimento_membro(uuid, jsonb) to authenticated;
grant execute on function public.definir_foto_membro(uuid, text) to authenticated;
grant execute on function public.membros_sem_consentimento(uuid) to authenticated;
grant execute on function public.emitir_carteirinha(uuid, text, date) to authenticated;
grant execute on function public.revogar_carteirinha(uuid) to authenticated;
grant execute on function public.carteirinha_do_membro(uuid) to authenticated;
grant execute on function public.carteirinha_por_token(text) to anon, authenticated;
grant execute on function public.carteirinha_foto_por_token(text) to service_role;
grant execute on function public.verificar_carteirinha(text) to anon, authenticated;

notify pgrst, 'reload schema';
