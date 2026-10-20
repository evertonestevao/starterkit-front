-- Igreja cadastrada pela de cima, e o pastor (ou secretário) que assume.
--
-- A sede cadastra subsedes e congregações; a subsede, congregações. A igreja
-- nasce já ligada (foi a própria mãe que criou), com a logo da mãe, mas SEM
-- DONO: fica "aguardando responsável" até a pessoa convidada assumir.
--
-- Regras que seguram o desenho (segurança):
--   * Quem cadastrou NÃO vira dono da igreja de baixo. A igreja de cima não lê
--     tesouraria, membros etc. da de baixo — e assim continua. Enquanto
--     ninguém assume, a de cima só mexe nos dados da página, por uma função.
--   * Cadastrar exige a permissão "Cadastrar igrejas na rede" (módulo
--     rede_cadastro) na igreja de cima — Responsável e Administrador sempre;
--     por cargo, o padrão é Pastor e Secretário. Só o Responsável altera
--     Acessos (já era assim).
--   * O convite para assumir é um link: o banco guarda só o hash do token, um
--     convite vale por vez (gerar outro cancela o anterior), tem prazo e serve
--     uma vez. Quem aceita tem que estar logado com o MESMO e-mail do convite.
--   * O dono (owner) só é gravado aqui dentro (a tabela recusa escrita direta
--     do papel pela API — migration 20261007110000).
--   * A tolerância da mensalidade passa a contar do dia em que alguém assume;
--     igreja aguardando responsável não entra na cobrança.

-- ---------------------------------------------------------------------------
-- 1. Permissão "Cadastrar igrejas na rede" (liberável por cargo, não desligável)
-- ---------------------------------------------------------------------------
alter table public.cargo_acessos drop constraint cargo_acessos_modulo_check;
alter table public.cargo_acessos add constraint cargo_acessos_modulo_check check (
  modulo in ('dashboard', 'acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns', 'relationships',
             'tesouraria', 'vendas', 'rede_cadastro')
);

alter table public.cargos drop constraint cargos_acessos_padrao_check;
alter table public.cargos add constraint cargos_acessos_padrao_check check (
  acessos_padrao <@ array['dashboard', 'acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns',
                          'relationships', 'tesouraria', 'vendas', 'rede_cadastro']
);

-- Padrão: Pastor e Secretário. As igrejas ajustam em Configurações → Acessos.
update public.cargos set acessos_padrao = acessos_padrao || array['rede_cadastro']
where church_id is null and slug in ('pastor', 'secretario') and not ('rede_cadastro' = any (acessos_padrao));

create or replace function public.meus_acessos()
returns table (company_id uuid, modulo text)
language sql
stable
security definer
set search_path = public
as $$
  select cm.company_id, mod.modulo
  from public.company_members cm
  cross join unnest(array['dashboard', 'acompanhamento', 'membros', 'ebd', 'programacao', 'events', 'campaigns',
                          'relationships', 'tesouraria', 'vendas', 'rede_cadastro'])
    as mod(modulo)
  where cm.user_id = auth.uid()
    and cm.deleted_at is null
    and public.tem_acesso_por_cargo(cm.company_id, mod.modulo);
$$;

-- ---------------------------------------------------------------------------
-- 2. Igreja aguardando responsável
-- ---------------------------------------------------------------------------
alter table public.churches
  add column if not exists aguardando_responsavel boolean not null default false,
  add column if not exists assumida_em timestamptz,
  add column if not exists cadastrada_por_church uuid references public.churches (id) on delete set null;

-- Ninguém muda isso pela API: só as funções abaixo.
revoke update (aguardando_responsavel, assumida_em, cadastrada_por_church) on public.churches from anon, authenticated;

-- Quem pode cadastrar e cuidar das igrejas abaixo de p_church_id: tem a
-- permissão numa igreja ACIMA dela (a mãe, a avó...).
create or replace function public.pode_gerir_igreja_abaixo(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.churches abaixo
    join public.churches acima
      on abaixo.path <@ acima.path and acima.id <> abaixo.id and acima.deleted_at is null
    where abaixo.id = p_church_id
      and abaixo.deleted_at is null
      and acima.company_id is not null
      and public.tem_acesso(acima.company_id, 'rede_cadastro')
  );
$$;

revoke all on function public.pode_gerir_igreja_abaixo(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cadastrar a igreja de baixo
-- ---------------------------------------------------------------------------
-- p_slug vem da aplicação (como no cadastro normal); repetido devolve 23505 e
-- a aplicação tenta com sufixo.
create or replace function public.cadastrar_igreja_da_rede(
  p_parent_church_id uuid,
  p_tipo text,
  p_nome text,
  p_sobrenome text,
  p_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mae public.churches%rowtype;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_sobrenome text := nullif(btrim(coalesce(p_sobrenome, '')), '');
  v_company uuid;
  v_church uuid;
  v_church_slug text;
begin
  select * into v_mae from public.churches where id = p_parent_church_id and deleted_at is null;
  if v_mae.id is null or v_mae.company_id is null or not public.tem_acesso(v_mae.company_id, 'rede_cadastro') then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;

  -- O que cada nível cadastra (mesma regra dos links de vínculo): congregação
  -- não tem igrejas abaixo; só a do topo cadastra subsede.
  if v_mae.tipo = 'congregacao' then
    raise exception 'uma congregação não cadastra igrejas abaixo dela' using errcode = '22023';
  end if;
  if p_tipo not in ('subsede', 'congregacao') or (p_tipo = 'subsede' and v_mae.parent_id is not null) then
    raise exception 'tipo de igreja inválido aqui' using errcode = '22023';
  end if;
  if char_length(v_nome) not between 2 and 120 then
    raise exception 'informe o nome da igreja' using errcode = '22023';
  end if;
  if v_sobrenome is not null and char_length(v_sobrenome) > 120 then
    raise exception 'complemento do nome muito longo' using errcode = '23514';
  end if;

  insert into public.companies (name, slug, created_by)
  values (v_nome, p_slug, auth.uid())
  returning id into v_company;

  v_church_slug := public.next_available_church_slug(p_slug);

  -- Sem company_members: a igreja nasce sem dono. Logo e tema vêm da mãe;
  -- página fora do ar até alguém assumir e publicar.
  insert into public.churches (
    company_id, parent_id, tipo, name, sobrenome, slug, public_code, path,
    logo_url, aguardando_responsavel, cadastrada_por_church
  )
  values (
    v_company, v_mae.id, p_tipo, v_nome, v_sobrenome, v_church_slug, v_church_slug, v_church_slug::ltree,
    v_mae.logo_url, true, v_mae.id
  )
  returning id into v_church;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_mae.company_id, auth.uid(), 'church.cadastrada_na_rede', 'church', v_church,
          jsonb_build_object('nome', v_nome, 'tipo', p_tipo));

  return v_church;
end;
$$;

revoke all on function public.cadastrar_igreja_da_rede(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.cadastrar_igreja_da_rede(uuid, text, text, text, text) to authenticated;

-- Enquanto ninguém assumiu, a de cima ajusta os dados da página. Depois que
-- alguém assume, só a própria igreja (a regra de sempre).
create or replace function public.editar_igreja_aguardando(p_church_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_igreja public.churches%rowtype;
  v_nome text := btrim(coalesce(p ->> 'nome', ''));
begin
  select * into v_igreja from public.churches where id = p_church_id and deleted_at is null for update;
  if v_igreja.id is null or not v_igreja.aguardando_responsavel or not public.pode_gerir_igreja_abaixo(p_church_id) then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;
  if char_length(v_nome) not between 2 and 120 then
    raise exception 'informe o nome da igreja' using errcode = '22023';
  end if;

  update public.churches set
    nome_proprio = v_nome,
    sobrenome = nullif(btrim(coalesce(p ->> 'sobrenome', '')), ''),
    sobre = nullif(btrim(coalesce(p ->> 'sobre', '')), ''),
    cep = nullif(regexp_replace(coalesce(p ->> 'cep', ''), '\D', '', 'g'), ''),
    logradouro = nullif(btrim(coalesce(p ->> 'logradouro', '')), ''),
    numero = nullif(btrim(coalesce(p ->> 'numero', '')), ''),
    complemento = nullif(btrim(coalesce(p ->> 'complemento', '')), ''),
    bairro = nullif(btrim(coalesce(p ->> 'bairro', '')), ''),
    cidade = nullif(btrim(coalesce(p ->> 'cidade', '')), ''),
    uf = nullif(upper(btrim(coalesce(p ->> 'uf', ''))), ''),
    address = nullif(btrim(coalesce(p ->> 'address', '')), '')
  where id = p_church_id;
end;
$$;

revoke all on function public.editar_igreja_aguardando(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.editar_igreja_aguardando(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Convite para assumir
-- ---------------------------------------------------------------------------
create table public.church_responsavel_convites (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  email text not null check (email = lower(email) and char_length(email) between 5 and 254 and email like '%_@_%'),
  nome text not null check (char_length(nome) between 2 and 120),
  -- Cargo que a pessoa recebe ao assumir (só os de responsabilidade).
  cargo_slug text check (cargo_slug is null or cargo_slug in ('pastor', 'secretario')),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,13}$'),
  expires_at timestamptz not null,
  usado_em timestamptz,
  usado_por uuid references auth.users (id) on delete set null,
  criado_por uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index church_responsavel_convites_church_idx on public.church_responsavel_convites (church_id);

alter table public.church_responsavel_convites enable row level security;
-- Ninguém lê nem escreve pela API: só as funções abaixo.
revoke all on table public.church_responsavel_convites from public, anon, authenticated;
create policy church_responsavel_convites_ninguem on public.church_responsavel_convites
  for all to anon, authenticated using (false) with check (false);

-- Gera o convite. Quem chama é quem cadastrou (ou outra pessoa com a
-- permissão acima) e LEVA o link à pessoa: o token nasce na aplicação e só o
-- hash chega aqui.
create or replace function public.convidar_responsavel(
  p_church_id uuid,
  p_token_hash text,
  p_email text,
  p_nome text,
  p_cargo text,
  p_whatsapp text,
  p_validade_horas integer default 168
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_igreja public.churches%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_validade timestamptz := now() + make_interval(hours => least(greatest(coalesce(p_validade_horas, 168), 1), 720));
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token inválido' using errcode = '22023';
  end if;
  select * into v_igreja from public.churches where id = p_church_id and deleted_at is null for update;
  -- Fase de cadastro: só igreja ainda sem dono (a troca de pastor numa igreja
  -- com dono é outra etapa, com outras regras).
  if v_igreja.id is null or not v_igreja.aguardando_responsavel or not public.pode_gerir_igreja_abaixo(p_church_id) then
    raise exception 'igreja não encontrada' using errcode = 'P0002';
  end if;

  -- Um convite válido por vez.
  update public.church_responsavel_convites set deleted_at = now()
  where church_id = p_church_id and usado_em is null and deleted_at is null;

  insert into public.church_responsavel_convites
    (church_id, company_id, token_hash, email, nome, cargo_slug, whatsapp, expires_at, criado_por)
  values
    (p_church_id, v_igreja.company_id, p_token_hash, v_email, btrim(coalesce(p_nome, '')), nullif(p_cargo, ''),
     nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), ''), v_validade, auth.uid());

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  select acima.company_id, auth.uid(), 'church.responsavel_convidado', 'church', p_church_id,
         jsonb_build_object('nome', btrim(coalesce(p_nome, '')), 'cargo', nullif(p_cargo, ''))
  from public.churches acima where acima.id = v_igreja.parent_id;

  return v_validade;
end;
$$;

revoke all on function public.convidar_responsavel(uuid, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.convidar_responsavel(uuid, text, text, text, text, text, integer) to authenticated;

-- O que o link mostra (sem login). Só devolve o e-mail enquanto o link vale.
create or replace function public.convite_responsavel_por_token(p_token text)
returns table (estado text, church_name text, tipo text, mae_name text, email text, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when k.usado_em is not null then 'usado'
      when k.deleted_at is not null or c.deleted_at is not null or not c.aguardando_responsavel then 'substituido'
      when k.expires_at <= now() then 'expirado'
      else 'valido'
    end,
    -- Nome com o complemento: "AD Ipiranga · Vila Mariana" (a congregação costuma ter o nome da sede).
    public.church_full_name(c.name, c.sobrenome), c.tipo, public.church_full_name(m.name, m.sobrenome),
    case when k.usado_em is null and k.deleted_at is null and k.expires_at > now() and c.aguardando_responsavel
         then k.email end,
    k.nome
  from public.church_responsavel_convites k
  join public.churches c on c.id = k.church_id
  left join public.churches m on m.id = c.parent_id
  where k.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

revoke all on function public.convite_responsavel_por_token(text) from public, anon, authenticated;
grant execute on function public.convite_responsavel_por_token(text) to anon, authenticated;

-- Assumir: logado com o e-mail do convite. Vira Responsável, a igreja deixa de
-- aguardar e a mensalidade começa a contar. Recebe o cargo combinado.
create or replace function public.aceitar_responsavel(p_token text)
returns table (company_id uuid, church_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_convite public.church_responsavel_convites%rowtype;
  v_igreja public.churches%rowtype;
  v_email text;
  v_cargo uuid;
  v_membro uuid;
begin
  if auth.uid() is null then
    raise exception 'entre na sua conta para assumir' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();

  select * into v_convite from public.church_responsavel_convites
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;
  if v_convite.id is not null then
    select * into v_igreja from public.churches where id = v_convite.church_id and deleted_at is null for update;
  end if;

  if v_convite.id is null or v_igreja.id is null or v_convite.usado_em is not null or v_convite.deleted_at is not null
     or v_convite.expires_at <= now() or not v_igreja.aguardando_responsavel then
    raise exception 'este convite não vale mais' using errcode = 'P0002';
  end if;
  if v_email is distinct from v_convite.email then
    raise exception 'este convite é para outro e-mail' using errcode = '42501';
  end if;

  -- Já é da conta (ex.: convidado antes como membro): promove; senão entra como Responsável.
  update public.company_members set role = 'owner', deleted_at = null
  where company_members.company_id = v_igreja.company_id and user_id = auth.uid();
  if not found then
    insert into public.company_members (company_id, user_id, role) values (v_igreja.company_id, auth.uid(), 'owner');
  end if;

  update public.churches set aguardando_responsavel = false, assumida_em = now() where id = v_igreja.id;
  update public.church_responsavel_convites set usado_em = now(), usado_por = auth.uid() where id = v_convite.id;

  -- O cargo combinado, no cadastro de membro (o login virou membro pelo gatilho).
  if v_convite.cargo_slug is not null then
    select id into v_cargo from public.cargos where church_id is null and slug = v_convite.cargo_slug;
    select id into v_membro from public.rol_membros
    where church_id = v_igreja.id and user_id = auth.uid() and deleted_at is null;
    if v_cargo is not null and v_membro is not null then
      insert into public.rol_membro_cargos (membro_id, cargo_id, church_id)
      values (v_membro, v_cargo, v_igreja.id)
      on conflict do nothing;
    end if;
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (v_igreja.company_id, auth.uid(), 'church.responsavel_assumiu', 'church', v_igreja.id,
          jsonb_build_object('convite', v_convite.id, 'cargo', v_convite.cargo_slug));

  return query select v_igreja.company_id, v_igreja.name;
end;
$$;

revoke all on function public.aceitar_responsavel(text) from public, anon, authenticated;
grant execute on function public.aceitar_responsavel(text) to authenticated;

-- As igrejas aguardando responsável abaixo de p_church_id, com o convite atual
-- (sem o token): para a tela de Vínculos da de cima.
create or replace function public.igrejas_aguardando_responsavel(p_church_id uuid)
returns table (
  church_id uuid, church_name text, nome_proprio text, sobrenome text, tipo text, created_at timestamptz,
  sobre text, cep text, logradouro text, numero text, complemento text, bairro text, cidade text, uf text,
  convite_nome text, convite_email text, convite_expira timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.nome_proprio, c.sobrenome, c.tipo, c.created_at,
         c.sobre, c.cep, c.logradouro, c.numero, c.complemento, c.bairro, c.cidade, c.uf,
         k.nome, k.email, k.expires_at
  from public.churches eu
  join public.churches c on c.path <@ eu.path and c.id <> eu.id and c.deleted_at is null and c.aguardando_responsavel
  left join lateral (
    select * from public.church_responsavel_convites k
    where k.church_id = c.id and k.usado_em is null and k.deleted_at is null
    order by k.created_at desc limit 1
  ) k on true
  where eu.id = p_church_id
    and eu.deleted_at is null
    and eu.company_id is not null
    and public.tem_acesso(eu.company_id, 'rede_cadastro')
  order by c.created_at desc;
$$;

revoke all on function public.igrejas_aguardando_responsavel(uuid) from public, anon, authenticated;
grant execute on function public.igrejas_aguardando_responsavel(uuid) to authenticated;

-- Conta já existe para o e-mail? Só o servidor pergunta (decide entre "entrar"
-- e "criar senha" na página de assumir) — nunca exposto à API.
create or replace function public.conta_existe_para_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from auth.users where lower(email) = lower(btrim(coalesce(p_email, ''))));
$$;

revoke all on function public.conta_existe_para_email(text) from public, anon, authenticated;
grant execute on function public.conta_existe_para_email(text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Mensalidade: conta de quando assumiu; aguardando não entra
-- ---------------------------------------------------------------------------
create or replace function public.mensalidades_pendentes_base(p_company_id uuid)
returns table (
  church_id uuid,
  church_name text,
  motivo text,
  desde date,
  tolerancia_ate date
)
language sql
stable
security definer
set search_path = public
as $$
  with igrejas as (
    select c.id, c.name,
           -- Igreja cadastrada pela de cima: a tolerância começa quando alguém assume.
           coalesce(c.assumida_em, c.created_at)::date as criada_em,
           (select a.id from public.sponsor_accounts a
             where a.church_id = c.id and a.is_self_payment and a.deleted_at is null) as conta
    from public.churches c
    where c.company_id = p_company_id
      and c.deleted_at is null
      and not c.aguardando_responsavel
      -- Com patrocinador ativo, a mensalidade está coberta.
      and public.church_real_billable_sponsorships(c.id) = 0
  ), situacao as (
    select i.*,
      (select min(ch.due_date) from public.sponsor_charges ch
        where ch.sponsor_id = i.conta and ch.status in ('pending', 'overdue')
          and ch.due_date < public.hoje_local()) as vencida_desde,
      exists (select 1 from public.sponsorships sp
               where sp.sponsor_id = i.conta and sp.church_id = i.id and sp.status = 'active') as ativa
    from igrejas i
  ), pendentes as (
    select s.id, s.name,
      case
        when s.vencida_desde is not null then 'fatura_vencida'
        when s.conta is null then 'sem_cadastro'
        else 'cadastro_incompleto'
      end as motivo,
      coalesce(s.vencida_desde, s.criada_em) as desde
    from situacao s
    where s.vencida_desde is not null or not s.ativa
  )
  select p.id, p.name, p.motivo, p.desde,
         p.desde + (select ps.mensalidade_tolerancia_dias from public.platform_settings ps where ps.id = 1)
  from pendentes p
  order by p.desde, p.name;
$$;

revoke all on function public.mensalidades_pendentes_base(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
