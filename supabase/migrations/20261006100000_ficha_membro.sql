-- Ficha completa do membro: dados pessoais, família, endereço, vida na igreja
-- e situação (ativo, afastado, transferido, desligado, falecido).
--
-- Fica numa tabela À PARTE de rol_membros de propósito: rol_membros é lida por
-- quem só faz a chamada (`can_acompanhar` aceita o módulo "acompanhamento"),
-- e endereço e família não são assunto de quem marca presença. Aqui só lê e
-- grava quem tem o módulo "membros" (ou administra a igreja).
--
-- Gravação só pela função `salvar_ficha_membro`: ela confere o acesso e
-- mantém `rol_membros.ativo` de acordo com a situação.

create table public.rol_membro_fichas (
  membro_id uuid primary key references public.rol_membros (id) on delete cascade,
  church_id uuid not null references public.churches (id),
  company_id uuid not null references public.companies (id),

  -- Pessoal
  sexo text check (sexo in ('masculino', 'feminino')),
  estado_civil text check (estado_civil in ('solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo')),
  naturalidade text check (char_length(naturalidade) <= 120),
  profissao text check (char_length(profissao) <= 120),

  -- Família
  conjuge_nome text check (char_length(conjuge_nome) <= 120),
  data_casamento date,
  pai_nome text check (char_length(pai_nome) <= 120),
  mae_nome text check (char_length(mae_nome) <= 120),
  filhos text check (char_length(filhos) <= 500),

  -- Endereço
  cep text check (cep ~ '^[0-9]{8}$'),
  logradouro text check (char_length(logradouro) <= 160),
  numero text check (char_length(numero) <= 20),
  complemento text check (char_length(complemento) <= 80),
  bairro text check (char_length(bairro) <= 80),
  cidade text check (char_length(cidade) <= 80),
  uf text check (uf ~ '^[A-Z]{2}$'),

  -- Vida na igreja (o batismo nas águas já está em rol_membros.batismo)
  data_conversao date,
  entrada_forma text check (entrada_forma in ('batismo', 'aclamacao', 'transferencia', 'outro')),
  membro_desde date,
  igreja_origem text check (char_length(igreja_origem) <= 160),

  -- Situação
  situacao text not null default 'ativo'
    check (situacao in ('ativo', 'afastado', 'transferido', 'desligado', 'falecido')),
  situacao_em date,
  situacao_motivo text check (char_length(situacao_motivo) <= 300),

  atualizado_por uuid references auth.users (id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rol_membro_fichas_company_idx on public.rol_membro_fichas (company_id);

alter table public.rol_membro_fichas enable row level security;

-- Tabela nova nasce com ALL para anon/authenticated: tira tudo e devolve só a leitura.
revoke all on public.rol_membro_fichas from public, anon, authenticated;
grant select on public.rol_membro_fichas to authenticated;

create policy "rol_membro_fichas_select" on public.rol_membro_fichas
  for select to authenticated
  using (deleted_at is null and public.tem_acesso(company_id, 'membros'));

-- ---------------------------------------------------------------------------
-- Gravar a ficha
-- ---------------------------------------------------------------------------
-- Recebe os campos em JSON (texto vazio = sem valor). Os limites de tamanho e
-- as listas de opções são os CHECKs da tabela: valor fora deles falha com 23514.
create or replace function public.salvar_ficha_membro(p_membro_id uuid, p_ficha jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membro public.rol_membros%rowtype;
  v_situacao_antes text;
  v_situacao text;
begin
  select * into v_membro from public.rol_membros where id = p_membro_id and deleted_at is null;
  -- Mesma resposta para "não existe" e "não é da sua igreja".
  if v_membro.id is null or not public.tem_acesso(v_membro.company_id, 'membros') then
    raise exception 'membro não encontrado' using errcode = 'P0002';
  end if;

  -- Sem ficha ainda, a situação de partida é a do cadastro (ativo ou não).
  select situacao into v_situacao_antes from public.rol_membro_fichas where membro_id = p_membro_id;
  v_situacao_antes := coalesce(v_situacao_antes, case when v_membro.ativo then 'ativo' else 'afastado' end);
  v_situacao := coalesce(nullif(btrim(p_ficha->>'situacao'), ''), v_situacao_antes);

  insert into public.rol_membro_fichas as f (
    membro_id, church_id, company_id,
    sexo, estado_civil, naturalidade, profissao,
    conjuge_nome, data_casamento, pai_nome, mae_nome, filhos,
    cep, logradouro, numero, complemento, bairro, cidade, uf,
    data_conversao, entrada_forma, membro_desde, igreja_origem,
    situacao, situacao_em, situacao_motivo, atualizado_por
  ) values (
    p_membro_id, v_membro.church_id, v_membro.company_id,
    nullif(btrim(p_ficha->>'sexo'), ''),
    nullif(btrim(p_ficha->>'estado_civil'), ''),
    nullif(btrim(p_ficha->>'naturalidade'), ''),
    nullif(btrim(p_ficha->>'profissao'), ''),
    nullif(btrim(p_ficha->>'conjuge_nome'), ''),
    nullif(btrim(p_ficha->>'data_casamento'), '')::date,
    nullif(btrim(p_ficha->>'pai_nome'), ''),
    nullif(btrim(p_ficha->>'mae_nome'), ''),
    nullif(btrim(p_ficha->>'filhos'), ''),
    nullif(btrim(p_ficha->>'cep'), ''),
    nullif(btrim(p_ficha->>'logradouro'), ''),
    nullif(btrim(p_ficha->>'numero'), ''),
    nullif(btrim(p_ficha->>'complemento'), ''),
    nullif(btrim(p_ficha->>'bairro'), ''),
    nullif(btrim(p_ficha->>'cidade'), ''),
    nullif(upper(btrim(p_ficha->>'uf')), ''),
    nullif(btrim(p_ficha->>'data_conversao'), '')::date,
    nullif(btrim(p_ficha->>'entrada_forma'), ''),
    nullif(btrim(p_ficha->>'membro_desde'), '')::date,
    nullif(btrim(p_ficha->>'igreja_origem'), ''),
    v_situacao,
    -- Situação "ativo" não guarda data nem motivo.
    case when v_situacao = 'ativo' then null else nullif(btrim(p_ficha->>'situacao_em'), '')::date end,
    case when v_situacao = 'ativo' then null else nullif(btrim(p_ficha->>'situacao_motivo'), '') end,
    auth.uid()
  )
  on conflict (membro_id) do update set
    sexo = excluded.sexo,
    estado_civil = excluded.estado_civil,
    naturalidade = excluded.naturalidade,
    profissao = excluded.profissao,
    conjuge_nome = excluded.conjuge_nome,
    data_casamento = excluded.data_casamento,
    pai_nome = excluded.pai_nome,
    mae_nome = excluded.mae_nome,
    filhos = excluded.filhos,
    cep = excluded.cep,
    logradouro = excluded.logradouro,
    numero = excluded.numero,
    complemento = excluded.complemento,
    bairro = excluded.bairro,
    cidade = excluded.cidade,
    uf = excluded.uf,
    data_conversao = excluded.data_conversao,
    entrada_forma = excluded.entrada_forma,
    membro_desde = excluded.membro_desde,
    igreja_origem = excluded.igreja_origem,
    situacao = excluded.situacao,
    situacao_em = excluded.situacao_em,
    situacao_motivo = excluded.situacao_motivo,
    atualizado_por = excluded.atualizado_por,
    deleted_at = null,
    updated_at = now();

  -- Só quando a situação MUDA: quem não está ativo sai da chamada e dos
  -- alertas; quem volta a ativo, volta. Salvar só o endereço não mexe nisso.
  if v_situacao <> v_situacao_antes then
    update public.rol_membros set ativo = (v_situacao = 'ativo') where id = p_membro_id;
  end if;
end;
$$;

revoke all on function public.salvar_ficha_membro(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_ficha_membro(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- O caminho contrário: "Ativo" marcado ou desmarcado no cadastro rápido
-- ---------------------------------------------------------------------------
-- Sem isto as duas telas se contradizem (ativo no cadastro, "falecido" na
-- ficha). Só age quando há ficha e ela discorda do novo valor.
create or replace function public.rol_membros_ativo_ajusta_ficha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ativo then
    update public.rol_membro_fichas
       set situacao = 'ativo', situacao_em = null, situacao_motivo = null, updated_at = now()
     where membro_id = new.id and situacao <> 'ativo';
  else
    update public.rol_membro_fichas
       set situacao = 'afastado', situacao_em = current_date, updated_at = now()
     where membro_id = new.id and situacao = 'ativo';
  end if;
  return null;
end;
$$;

revoke all on function public.rol_membros_ativo_ajusta_ficha() from public, anon, authenticated;

create trigger rol_membros_ativo_ajusta_ficha
  after update of ativo on public.rol_membros
  for each row
  when (old.ativo is distinct from new.ativo)
  execute function public.rol_membros_ativo_ajusta_ficha();

notify pgrst, 'reload schema';
