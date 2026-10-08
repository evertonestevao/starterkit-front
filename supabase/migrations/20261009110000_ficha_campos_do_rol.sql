-- Ficha do membro: os campos que a secretaria usava no sistema antigo.
--
-- Entram na ficha (que já é só de quem tem o módulo Membros — secretaria e
-- pastor; quem só faz a chamada não lê esta tabela):
--   * número da ficha (o "rol"): como a secretaria cita o membro. Único por
--     igreja, quando informado;
--   * CPF e RG: para carta de transferência e para não cadastrar a mesma
--     pessoa duas vezes. O CPF é único por igreja, quando informado. Não é
--     login — o login continua sendo por e-mail;
--   * segundo telefone;
--   * local do batismo nas águas (a data já fica no cadastro), batismo no
--     Espírito Santo (data e local);
--   * consagração: a qual ministério, onde e por quem.
--
-- Ficam de fora, de propósito: título de eleitor, zona e seção (dado eleitoral
-- junto da filiação religiosa é risco sem uso), dados da firma e o bloco de
-- estrangeiro.

alter table public.rol_membro_fichas
  add column if not exists numero_ficha text check (char_length(numero_ficha) between 1 and 20),
  add column if not exists cpf text check (cpf ~ '^[0-9]{11}$'),
  add column if not exists rg text check (char_length(rg) <= 20),
  add column if not exists telefone2 text check (char_length(telefone2) between 8 and 20),
  add column if not exists batismo_aguas_local text check (char_length(batismo_aguas_local) <= 120),
  add column if not exists batismo_espirito_data date,
  add column if not exists batismo_espirito_local text check (char_length(batismo_espirito_local) <= 120),
  add column if not exists consagracao_ministerio text check (char_length(consagracao_ministerio) <= 120),
  add column if not exists consagracao_onde_por_quem text check (char_length(consagracao_onde_por_quem) <= 200);

-- Um número de ficha e um CPF por pessoa, dentro da igreja.
create unique index if not exists rol_membro_fichas_numero_ficha_idx
  on public.rol_membro_fichas (church_id, lower(numero_ficha))
  where numero_ficha is not null and deleted_at is null;
create unique index if not exists rol_membro_fichas_cpf_idx
  on public.rol_membro_fichas (church_id, cpf)
  where cpf is not null and deleted_at is null;

comment on column public.rol_membro_fichas.cpf is
  'Só os 11 dígitos. Identificação do membro; não é login.';

-- A mesma função de antes, com os campos novos.
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
    numero_ficha, cpf, rg, telefone2, batismo_aguas_local,
    batismo_espirito_data, batismo_espirito_local, consagracao_ministerio, consagracao_onde_por_quem,
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
    nullif(btrim(p_ficha->>'numero_ficha'), ''),
    nullif(regexp_replace(coalesce(p_ficha->>'cpf', ''), '[^0-9]', '', 'g'), ''),
    nullif(btrim(p_ficha->>'rg'), ''),
    nullif(btrim(p_ficha->>'telefone2'), ''),
    nullif(btrim(p_ficha->>'batismo_aguas_local'), ''),
    nullif(btrim(p_ficha->>'batismo_espirito_data'), '')::date,
    nullif(btrim(p_ficha->>'batismo_espirito_local'), ''),
    nullif(btrim(p_ficha->>'consagracao_ministerio'), ''),
    nullif(btrim(p_ficha->>'consagracao_onde_por_quem'), ''),
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
    numero_ficha = excluded.numero_ficha,
    cpf = excluded.cpf,
    rg = excluded.rg,
    telefone2 = excluded.telefone2,
    batismo_aguas_local = excluded.batismo_aguas_local,
    batismo_espirito_data = excluded.batismo_espirito_data,
    batismo_espirito_local = excluded.batismo_espirito_local,
    consagracao_ministerio = excluded.consagracao_ministerio,
    consagracao_onde_por_quem = excluded.consagracao_onde_por_quem,
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

notify pgrst, 'reload schema';
