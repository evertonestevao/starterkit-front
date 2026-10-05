-- ---------------------------------------------------------------------------
-- Seed de DEMONSTRAÇÃO: Chamada e Acompanhamento
-- ---------------------------------------------------------------------------
-- Só para o banco de DEV: cria contas com senha conhecida (dev123456).
-- Rodar com:  node scripts/seed-acompanhamento.mjs
--
-- Monta uma rede separada, com slugs demo-*:
--   Demo Sede (40 membros)                       pastor.demo.sede@dev.local
--   ├── Demo Subsede Norte (6)                   pastor.demo.norte@dev.local
--   │   ├── Demo Congregação Vila Nova (6)       pastor.demo.vilanova@dev.local
--   │   └── Demo Congregação Aurora (6)          pastor.demo.aurora@dev.local
--   └── Demo Subsede Sul (6)                     pastor.demo.sul@dev.local
--       └── Demo Congregação Centro (6)          pastor.demo.centro@dev.local
-- + secretario.demo@dev.local: member da sede com o cargo Secretário(a).
--
-- 8 semanas de cultos (domingo + quarta de oração) com os casos que o módulo
-- precisa mostrar, todos na Demo Sede:
--   Antônio, Bruna, Carlos      faltas seguidas            -> Em alerta
--   Daniela                     falta, falta, justif., falta -> alerta com 3
--   Eduardo                     viagem nas 3 últimas semanas -> justificado, sem alerta
--   Fernanda                    saúde há 7 semanas         -> Justificativas longas
--   Gabriel                     em alerta, contato "em acompanhamento"
--   Helena                      faltou 3, contato "retornou" e voltou a vir -> fora da lista
--   Igor                        inativo, sempre ausente    -> nunca alerta
--   Júlia                       viagem marcada para a semana que vem (futura)
--
-- Cargos (catálogo com herança):
--   padrão da plataforma: Pastor, Diácono, Presbítero, Tesoureiro(a)...
--   Demo Sede cria "Coordenador de células"   -> todas as igrejas abaixo usam
--   Demo Subsede Norte cria "Líder de casais" -> Vila Nova e Aurora usam
--   Demo Congregação Vila Nova cria "Zelador(a)" -> só ela
--   Vários membros da sede com cargos (alguns com dois).
--
-- EBD (Demo Sede): 4 classes, 6 domingos de aula, crianças "não membro" e
-- uma professora com login: professora.demo@dev.local (só vê os Juniores).
-- secretaria.ebd.demo@dev.local: member da sede com o cargo Secretário(a) da EBD.

do $$
begin
  if exists (select 1 from public.churches where slug = 'demo-sede') then
    raise exception 'seed de demonstração já aplicado (demo-sede existe)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Ajudantes (removidos no fim)
-- ---------------------------------------------------------------------------
create or replace function public.__demo_user(p_email text, p_nome text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is not null then return v_id; end if;
  v_id := gen_random_uuid();

  -- Colunas de token como string vazia: NULL quebra o GoTrue (ver seed.sql).
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  )
  values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, crypt('dev123456', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_nome), now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.terms_acceptances (user_id, terms_version_id)
  select v_id, id from public.terms_versions where is_current and audience = 'igreja';

  return v_id;
end;
$$;

create or replace function public.__demo_church(
  p_slug text, p_nome text, p_tipo text, p_parent uuid, p_email text, p_pastor text
)
returns uuid
language plpgsql
as $$
declare
  v_user uuid;
  v_company uuid;
  v_church uuid;
begin
  v_user := public.__demo_user(p_email, p_pastor);

  insert into public.companies (name, slug, created_by)
  values (p_nome, p_slug, v_user)
  returning id into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company, v_user, 'owner');

  insert into public.churches (company_id, name, slug, public_code, tipo, parent_id, address)
  values (v_company, p_nome, p_slug, p_slug, p_tipo, p_parent, 'Rua da Demonstração, 10')
  returning id into v_church;

  -- O login do pastor já virou membro (trigger garante_membro_do_login);
  -- aqui ele só recebe o cargo.
  insert into public.rol_membro_cargos (membro_id, cargo_id, church_id)
  select m.id, (select id from public.cargos where slug = 'pastor'), v_church
  from public.rol_membros m where m.church_id = v_church and m.user_id = v_user;

  return v_church;
end;
$$;

-- Programação de uma igreja: domingo (19h) e quarta de oração (20h) com
-- chamada; ensaio do louvor (sábado) sem chamada, para mostrar a opção.
create or replace function public.__demo_cultos(p_church uuid, out domingo uuid, out quarta uuid)
language plpgsql
as $$
begin
  insert into public.church_schedule (church_id, titulo, tipo, dia_semana, hora)
  values (p_church, 'Culto de Domingo', 'semanal', 0, '19:00')
  returning id into domingo;
  insert into public.church_schedule (church_id, titulo, tipo, dia_semana, hora)
  values (p_church, 'Culto de Oração', 'semanal', 3, '20:00')
  returning id into quarta;
  insert into public.church_schedule (church_id, titulo, tipo, dia_semana, hora, registra_chamada)
  values (p_church, 'Ensaio do louvor', 'semanal', 6, '16:00', false);
end;
$$;

-- Registra (ou acrescenta a) chamada de um culto numa data.
create or replace function public.__demo_presenca(p_culto uuid, p_data date, p_membro uuid, p_estado text)
returns void
language plpgsql
as $$
declare
  v_chamada uuid;
  v_church uuid;
  v_just uuid;
begin
  select church_id into v_church from public.church_schedule where id = p_culto;
  select id into v_chamada from public.chamadas where schedule_id = p_culto and data = p_data and deleted_at is null;
  if v_chamada is null then
    insert into public.chamadas (church_id, schedule_id, data) values (v_church, p_culto, p_data)
    returning id into v_chamada;
  end if;

  if p_estado = 'justificado' then
    select id into v_just from public.justificativas
    where membro_id = p_membro and deleted_at is null and p_data between data_inicio and data_fim
    limit 1;
  end if;

  insert into public.chamada_presencas (chamada_id, membro_id, church_id, estado, justificativa_id)
  values (v_chamada, p_membro, v_church, p_estado, v_just)
  on conflict (chamada_id, membro_id) do update set estado = excluded.estado, justificativa_id = excluded.justificativa_id;
end;
$$;

-- Dá um cargo a um membro. `p_cargo` é slug (padrão) ou nome (criado por uma igreja).
create or replace function public.__demo_cargo(p_membro uuid, p_cargo text)
returns void
language plpgsql
as $$
declare
  v_church uuid;
  v_cargo uuid;
begin
  select church_id into v_church from public.rol_membros where id = p_membro;
  select c.id into v_cargo
  from public.cargos c
  where c.deleted_at is null and (c.slug = p_cargo or c.nome = p_cargo)
    and public.cargo_disponivel_para(c.id, v_church)
  limit 1;
  if v_cargo is null then raise exception 'cargo % indisponivel', p_cargo; end if;
  insert into public.rol_membro_cargos (membro_id, cargo_id, church_id) values (p_membro, v_cargo, v_church);
end;
$$;

-- Rol simples de uma igreja menor: n membros, quase todos presentes, o
-- último sumido (gera 1 alerta na igreja, para o resumo da rede ter número).
create or replace function public.__demo_rol_pequeno(p_church uuid, p_prefixo text, p_n int, p_domingo_base date)
returns void
language plpgsql
as $$
declare
  v_cultos record;
  v_membro uuid;
  v_nomes text[] := array['Ana', 'Bento', 'Cecília', 'Diego', 'Elisa', 'Fábio', 'Graça', 'Hugo'];
  i int;
  s int;
  v_estado text;
begin
  select * into v_cultos from public.__demo_cultos(p_church);
  for i in 1 .. p_n loop
    insert into public.rol_membros (church_id, nome, whatsapp)
    values (p_church, v_nomes[i] || ' ' || p_prefixo, '119' || lpad((70000000 + i * 1311)::text, 8, '0'))
    returning id into v_membro;
    if i = 1 then perform public.__demo_cargo(v_membro, 'diacono'); end if;
    if i = 2 then perform public.__demo_cargo(v_membro, 'Coordenador de células'); end if;
    for s in 0 .. 7 loop
      v_estado := case
        when i = p_n and s <= 3 then 'ausente'
        when (i + s) % 7 = 0 then 'ausente'
        else 'presente' end;
      perform public.__demo_presenca(v_cultos.domingo, p_domingo_base - 7 * s, v_membro, v_estado);
      perform public.__demo_presenca(v_cultos.quarta, p_domingo_base - 7 * s - 4, v_membro,
        case when i = p_n and s <= 3 then 'ausente' else 'presente' end);
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- A rede
-- ---------------------------------------------------------------------------
do $$
declare
  -- Último domingo (hoje, se hoje for domingo).
  v_dom date := current_date - extract(dow from current_date)::int;
  v_sede uuid;
  v_norte uuid;
  v_sul uuid;
  v_church uuid;
  v_cultos record;
  v_secretario uuid;
  v_membro uuid;
  v_ids uuid[] := '{}';
  v_nomes text[] := array[
    'Antônio Ferreira', 'Bruna Almeida', 'Carlos Souza', 'Daniela Rocha', 'Eduardo Lima',
    'Fernanda Castro', 'Gabriel Martins', 'Helena Duarte', 'Igor Pacheco', 'Júlia Nogueira',
    'Karina Mendes', 'Lucas Barbosa', 'Marta Ribeiro', 'Nelson Prado', 'Olívia Teixeira',
    'Paulo Moreira', 'Quitéria Santos', 'Rafael Gomes', 'Sara Pinheiro', 'Tiago Azevedo',
    'Úrsula Campos', 'Vitor Freitas', 'Wanda Lopes', 'Xavier Cardoso', 'Yasmin Correia',
    'Zeca Monteiro', 'Alice Cunha', 'Benedito Araújo', 'Clara Vieira', 'Davi Batista',
    'Elaine Farias', 'Francisco Melo', 'Glória Pires', 'Henrique Dias', 'Isabel Reis',
    'Joaquim Neves', 'Lívia Matos', 'Mateus Carvalho', 'Natália Brito', 'Otávio Ramos'
  ];
  i int;
  s int;
  v_data_dom date;
  v_data_qua date;
  v_estado_dom text;
  v_estado_qua text;
begin
  v_sede := public.__demo_church('demo-sede', 'Demo Sede', 'sede', null, 'pastor.demo.sede@dev.local', 'Pr. Demo Sede');
  v_norte := public.__demo_church('demo-norte', 'Demo Subsede Norte', 'subsede', v_sede, 'pastor.demo.norte@dev.local', 'Pr. Demo Norte');
  v_sul := public.__demo_church('demo-sul', 'Demo Subsede Sul', 'subsede', v_sede, 'pastor.demo.sul@dev.local', 'Pr. Demo Sul');

  -- Cargos criados pelas igrejas (os padrões vêm da plataforma).
  insert into public.cargos (church_id, nome, descricao, ordem) values
    (v_sede, 'Coordenador de células', 'Acompanha os líderes das células da rede.', 20),
    (v_norte, 'Líder de casais', 'Ministério de casais da Subsede Norte.', 21);

  -- Secretário: member da sede; o acesso vem do cargo Secretário(a).
  v_secretario := public.__demo_user('secretario.demo@dev.local', 'Secretário Demo');
  insert into public.company_members (company_id, user_id, role)
  select company_id, v_secretario, 'member' from public.churches where id = v_sede;
  insert into public.rol_membro_cargos (membro_id, cargo_id, church_id)
  select m.id, (select id from public.cargos where slug = 'secretario'), v_sede
  from public.rol_membros m where m.church_id = v_sede and m.user_id = v_secretario;

  -- ---------------------------- Demo Sede ----------------------------------
  select * into v_cultos from public.__demo_cultos(v_sede);

  for i in 1 .. 40 loop
    insert into public.rol_membros (church_id, nome, whatsapp, nascimento, ativo, observacoes)
    values (
      v_sede, v_nomes[i],
      '119' || lpad((80000000 + i * 2711)::text, 8, '0'),
      case when i % 3 = 0 then date '1970-01-01' + (i * 389) else null end,
      i <> 9, -- Igor está inativo
      case when i = 9 then 'Mudou para o interior; aguardando carta de transferência.' else null end
    )
    returning id into v_membro;
    v_ids := v_ids || v_membro;
  end loop;

  -- Cargos dos membros da sede (alguns com dois).
  perform public.__demo_cargo(v_ids[12], 'diacono');                -- Lucas
  perform public.__demo_cargo(v_ids[13], 'diaconisa');              -- Marta
  perform public.__demo_cargo(v_ids[14], 'presbitero');             -- Nelson
  perform public.__demo_cargo(v_ids[16], 'presbitero');             -- Paulo
  perform public.__demo_cargo(v_ids[18], 'tesoureiro');             -- Rafael
  perform public.__demo_cargo(v_ids[19], 'lider_louvor');           -- Sara
  perform public.__demo_cargo(v_ids[20], 'lider_jovens');           -- Tiago
  perform public.__demo_cargo(v_ids[20], 'Coordenador de células'); -- Tiago (2º)
  perform public.__demo_cargo(v_ids[29], 'professor_ebd');          -- Clara
  perform public.__demo_cargo(v_ids[35], 'secretario');             -- Isabel
  perform public.__demo_cargo(v_ids[35], 'Coordenador de células'); -- Isabel (2º)
  perform public.__demo_cargo(v_ids[36], 'obreiro');                -- Joaquim
  perform public.__demo_cargo(v_ids[38], 'evangelista');            -- Mateus
  perform public.__demo_cargo(v_ids[40], 'pastor_auxiliar');        -- Otávio

  -- Justificativas por período.
  insert into public.justificativas (church_id, membro_id, motivo, motivo_texto, data_inicio, data_fim)
  values
    -- Eduardo: viagem nas 3 últimas semanas (cobre domingos e quartas).
    (v_sede, v_ids[5], 'viagem', 'Férias com a família no Nordeste', v_dom - 18, v_dom + 3),
    -- Fernanda: saúde há 7 semanas e ainda em curso.
    (v_sede, v_ids[6], 'saude', 'Recuperação de cirurgia', v_dom - 49, v_dom + 30),
    -- Júlia: viagem futura, semana que vem.
    (v_sede, v_ids[10], 'trabalho', 'Treinamento da empresa em outra cidade', v_dom + 6, v_dom + 13);

  -- s = semanas atrás (0 = esta semana). Domingo e a quarta anterior a ele.
  for s in 0 .. 7 loop
    v_data_dom := v_dom - 7 * s;
    v_data_qua := v_dom - 7 * s - 4;

    for i in 1 .. 40 loop
      v_estado_dom := 'presente';
      v_estado_qua := case when (i + s) % 4 = 0 then 'ausente' else 'presente' end;

      if i in (1, 2, 3) and s <= 3 then
        -- Antônio, Bruna, Carlos: sumiram há 4 semanas.
        v_estado_dom := 'ausente'; v_estado_qua := 'ausente';
      elsif i = 4 and s <= 2 then
        -- Daniela, do mais antigo ao mais recente: falta (quarta), falta,
        -- justificado, falta. Nas quartas mais recentes ela não tem chamada
        -- (uma presença ali zeraria a sequência do exemplo).
        v_estado_dom := case s when 0 then 'ausente' when 1 then 'justificado' else 'ausente' end;
        v_estado_qua := case s when 2 then 'ausente' else null end;
      elsif i = 5 and s <= 2 then
        -- Eduardo: marcado ausente; a justificativa por período cobre (vira justificado).
        v_estado_dom := 'ausente'; v_estado_qua := 'ausente';
      elsif i = 6 and s <= 6 then
        v_estado_dom := 'justificado'; v_estado_qua := 'justificado';
      elsif i = 7 and s <= 2 then
        v_estado_dom := 'ausente'; v_estado_qua := 'ausente';
      elsif i = 8 and s between 1 and 3 then
        -- Helena faltou 3 e voltou neste domingo.
        v_estado_dom := 'ausente'; v_estado_qua := 'ausente';
      elsif i = 9 then
        v_estado_dom := 'ausente'; v_estado_qua := 'ausente';
      elsif (i * 3 + s) % 11 = 0 then
        -- Faltas esparsas do resto da igreja (nunca três seguidas).
        v_estado_dom := 'ausente';
      end if;

      perform public.__demo_presenca(v_cultos.domingo, v_data_dom, v_ids[i], v_estado_dom);
      if v_estado_qua is not null and v_data_qua <= current_date then
        perform public.__demo_presenca(v_cultos.quarta, v_data_qua, v_ids[i], v_estado_qua);
      end if;
    end loop;

    -- Visitantes no domingo.
    insert into public.chamada_visitantes (chamada_id, church_id, nome, telefone)
    select ch.id, v_sede, 'Visitante ' || (s + 1) || '-' || g, case when g = 1 then '11955550' || lpad(s::text, 3, '0') end
    from public.chamadas ch, generate_series(1, 1 + s % 3) g
    where ch.schedule_id = v_cultos.domingo and ch.data = v_data_dom;
  end loop;

  -- Contatos do pastor.
  insert into public.acompanhamento_contatos (church_id, membro_id, motivo, data, resultado, observacao)
  values
    (v_sede, v_ids[7], 'faltas', current_date - 1, 'em_acompanhamento', 'Passando por luto. Visita marcada para sábado.'),
    (v_sede, v_ids[8], 'faltas', v_dom - 3, 'retornou', 'Estava com o horário de trabalho trocado. Volta domingo.');

  -- ------------------------- Igrejas menores -------------------------------
  perform public.__demo_rol_pequeno(v_norte, 'Norte', 6, v_dom);
  perform public.__demo_rol_pequeno(v_sul, 'Sul', 6, v_dom);

  v_church := public.__demo_church('demo-norte-vilanova', 'Demo Congregação Vila Nova', 'congregacao', v_norte,
    'pastor.demo.vilanova@dev.local', 'Pr. Demo Vila Nova');
  insert into public.cargos (church_id, nome, ordem) values (v_church, 'Zelador(a)', 30);
  perform public.__demo_rol_pequeno(v_church, 'Vila Nova', 6, v_dom);
  perform public.__demo_cargo(
    (select id from public.rol_membros where church_id = v_church and nome like 'Cecília%'), 'Zelador(a)');
  perform public.__demo_cargo(
    (select id from public.rol_membros where church_id = v_church and nome like 'Diego%'), 'Líder de casais');

  v_church := public.__demo_church('demo-norte-aurora', 'Demo Congregação Aurora', 'congregacao', v_norte,
    'pastor.demo.aurora@dev.local', 'Pr. Demo Aurora');
  perform public.__demo_rol_pequeno(v_church, 'Aurora', 6, v_dom);

  v_church := public.__demo_church('demo-sul-centro', 'Demo Congregação Centro', 'congregacao', v_sul,
    'pastor.demo.centro@dev.local', 'Pr. Demo Centro');
  perform public.__demo_rol_pequeno(v_church, 'Centro', 6, v_dom);
end $$;

-- ---------------------------------------------------------------------------
-- EBD da Demo Sede
-- ---------------------------------------------------------------------------
--   Adultos (prof. Nelson Prado, sem login)     10 membros
--   Jovens (prof. Tiago Azevedo, sem login)      5 membros
--   Juniores 9-11 (prof. Professora Demo, COM login: professora.demo@dev.local)
--                                                6 crianças "não membro" + 1 membro
--   Primários 6-8 (prof. Clara Vieira)           5 crianças "não membro"
-- 6 domingos de aula; os Primários ficam sem chamada no último (aparece
-- "chamada não feita"); um visitante dos Juniores espera matrícula.
do $$
declare
  v_dom date := current_date - extract(dow from current_date)::int;
  v_sede uuid;
  v_prof uuid;
  k_adultos uuid; k_jovens uuid; k_juniores uuid; k_primarios uuid;
  v_classe record;
  v_aula uuid;
  v_aluno record;
  v_estado text;
  s int;
  i int;
begin
  select id into v_sede from public.churches where slug = 'demo-sede';

  -- Secretaria da EBD com login (member): o acesso vem do cargo.
  insert into public.company_members (company_id, user_id, role)
  select company_id, public.__demo_user('secretaria.ebd.demo@dev.local', 'Secretária EBD Demo'), 'member'
  from public.churches where id = v_sede;
  perform public.__demo_cargo(
    (select m.id from public.rol_membros m join auth.users u on u.id = m.user_id
     where u.email = 'secretaria.ebd.demo@dev.local' and m.church_id = v_sede),
    'secretario_ebd');

  -- Professora com login (member): o trigger já cria o membro dela.
  v_prof := public.__demo_user('professora.demo@dev.local', 'Professora Demo');
  insert into public.company_members (company_id, user_id, role)
  select company_id, v_prof, 'member' from public.churches where id = v_sede;
  perform public.__demo_cargo((select id from public.rol_membros where user_id = v_prof and church_id = v_sede), 'professor_ebd');

  insert into public.ebd_classes (church_id, nome, faixa_etaria, sala, ordem, idade_minima, idade_maxima) values
    (v_sede, 'Adultos', 'a partir de 25 anos', 'Templo', 1, 25, null) returning id into k_adultos;
  insert into public.ebd_classes (church_id, nome, faixa_etaria, sala, ordem, idade_minima, idade_maxima) values
    (v_sede, 'Jovens', '18 a 24 anos', 'Sala 1', 2, 18, 24) returning id into k_jovens;
  insert into public.ebd_classes (church_id, nome, faixa_etaria, sala, ordem, idade_minima, idade_maxima) values
    (v_sede, 'Juniores', '9 a 11 anos', 'Sala 2', 3, 9, 11) returning id into k_juniores;
  insert into public.ebd_classes (church_id, nome, faixa_etaria, sala, ordem, idade_minima, idade_maxima) values
    (v_sede, 'Primários', '6 a 8 anos', 'Sala 3', 4, 6, 8) returning id into k_primarios;

  insert into public.ebd_professores (classe_id, membro_id, church_id)
  select k_adultos, id, v_sede from public.rol_membros where church_id = v_sede and nome = 'Nelson Prado'
  union all
  select k_jovens, id, v_sede from public.rol_membros where church_id = v_sede and nome = 'Tiago Azevedo'
  union all
  select k_juniores, id, v_sede from public.rol_membros where church_id = v_sede and user_id = v_prof
  union all
  select k_primarios, id, v_sede from public.rol_membros where church_id = v_sede and nome = 'Clara Vieira';

  -- Adultos e Jovens: membros do rol.
  insert into public.ebd_matriculas (classe_id, membro_id, church_id, desde)
  select k_adultos, id, v_sede, v_dom - 70 from public.rol_membros
  where church_id = v_sede and nome in ('Antônio Ferreira', 'Bruna Almeida', 'Elaine Farias', 'Francisco Melo',
    'Glória Pires', 'Henrique Dias', 'Joaquim Neves', 'Marta Ribeiro', 'Paulo Moreira', 'Wanda Lopes');
  insert into public.ebd_matriculas (classe_id, membro_id, church_id, desde)
  select k_jovens, id, v_sede, v_dom - 70 from public.rol_membros
  where church_id = v_sede and nome in ('Davi Batista', 'Lívia Matos', 'Natália Brito', 'Yasmin Correia', 'Vitor Freitas');

  -- Crianças: não fazem parte do quadro de membros e não entram na chamada dos cultos.
  for i in 1 .. 6 loop
    insert into public.rol_membros (church_id, nome, nascimento, membro_igreja, participa_chamada, observacoes)
    values (v_sede, (array['Pedro Ferreira', 'Sofia Almeida', 'Lucas Melo', 'Helena Pires', 'Miguel Dias', 'Laura Neves'])[i],
            date '2015-03-01' + i * 97, false, false, 'Filho(a) de membro.')
    returning id into v_aluno;
    insert into public.ebd_matriculas (classe_id, membro_id, church_id, desde) values (k_juniores, v_aluno.id, v_sede, v_dom - 70);
  end loop;
  -- Um membro adolescente nos Juniores também.
  insert into public.ebd_matriculas (classe_id, membro_id, church_id, desde)
  select k_juniores, id, v_sede, v_dom - 70 from public.rol_membros where church_id = v_sede and nome = 'Zeca Monteiro';

  for i in 1 .. 5 loop
    insert into public.rol_membros (church_id, nome, nascimento, membro_igreja, participa_chamada)
    values (v_sede, (array['Ana Clara Lopes', 'Bento Moreira', 'Cecília Ribeiro', 'Gael Campos', 'Isis Cardoso'])[i],
            date '2018-02-01' + i * 83, false, false)
    returning id into v_aluno;
    insert into public.ebd_matriculas (classe_id, membro_id, church_id, desde) values (k_primarios, v_aluno.id, v_sede, v_dom - 70);
  end loop;

  -- 6 domingos de aula.
  for s in 0 .. 5 loop
    for v_classe in
      select id, nome from public.ebd_classes where church_id = v_sede and deleted_at is null
    loop
      continue when v_classe.id = k_primarios and s = 0; -- chamada ainda não feita
      insert into public.ebd_aulas (classe_id, church_id, data, licao, biblias, revistas, oferta_centavos)
      values (v_classe.id, v_sede, v_dom - 7 * s, 'Lição ' || (13 - s) || ' do trimestre',
              case v_classe.nome when 'Adultos' then 8 when 'Jovens' then 4 else 3 end - (s % 2),
              case v_classe.nome when 'Adultos' then 7 when 'Jovens' then 3 else 4 end,
              case v_classe.nome when 'Adultos' then 4500 + s * 250 when 'Jovens' then 1200 else 650 + s * 50 end)
      returning id into v_aula;

      i := 0;
      for v_aluno in
        select mt.membro_id from public.ebd_matriculas mt join public.rol_membros m on m.id = mt.membro_id
        where mt.classe_id = v_classe.id and mt.ate is null order by m.nome
      loop
        i := i + 1;
        -- Perfis variados, para os relatórios e destaques não darem todo mundo
        -- com a mesma presença: assíduo (100%), uma falta, duas faltas, uma
        -- falta e uma justificativa, e quem falta bastante (nunca 3 seguidas
        -- recentes: os alertas ficam só com os dois casos montados abaixo).
        v_estado := case i % 5
          when 1 then case when s = 4 then 'ausente' else 'presente' end
          when 2 then case when s in (1, 4) then 'ausente' else 'presente' end
          when 3 then case when s = 3 then 'ausente' when s = 5 then 'justificado' else 'presente' end
          when 4 then case when s in (0, 2, 5) then 'ausente' else 'presente' end
          else 'presente'
        end;
        insert into public.ebd_presencas (aula_id, membro_id, classe_id, church_id, estado)
        values (v_aula, v_aluno.membro_id, v_classe.id, v_sede, v_estado);
      end loop;

      if (s + length(v_classe.nome)) % 3 = 0 then
        insert into public.ebd_visitantes (aula_id, classe_id, church_id, nome, telefone)
        values (v_aula, v_classe.id, v_sede, 'Visitante ' || v_classe.nome || ' ' || (s + 1), null);
      end if;
    end loop;
  end loop;

  -- Alerta da EBD: Antônio (Adultos) e Lucas Melo (Juniores) faltaram os
  -- últimos 3 domingos na classe.
  update public.ebd_presencas p set estado = 'ausente'
  from public.ebd_aulas a, public.rol_membros m
  where a.id = p.aula_id and m.id = p.membro_id and a.church_id = v_sede
    and a.data >= v_dom - 14 and m.nome in ('Antônio Ferreira', 'Lucas Melo');

  -- Trimestres: o anterior e o atual (pelo calendário).
  insert into public.ebd_trimestres (church_id, nome, inicio, fim, revista)
  select v_sede,
         (extract(quarter from d)::int) || 'º trimestre de ' || extract(year from d)::int,
         date_trunc('quarter', d)::date,
         (date_trunc('quarter', d) + interval '3 months - 1 day')::date,
         'Lições Bíblicas — ' || (extract(quarter from d)::int) || 'º trimestre'
  from (values (current_date - 92), (current_date)) as v(d);

  -- Lições: uma por domingo de cada trimestre; o anterior com títulos.
  insert into public.ebd_licoes (trimestre_id, church_id, numero, data, titulo)
  select t.id, v_sede, row_number() over (partition by t.id order by d)::smallint, d::date,
         case when t.inicio < current_date - 30
              then (array['A criação', 'A queda', 'Noé e o dilúvio', 'O chamado de Abraão', 'A fé de Abraão',
                          'Isaque, o filho da promessa', 'Jacó e Esaú', 'José no Egito', 'Moisés', 'O êxodo',
                          'Os dez mandamentos', 'O tabernáculo', 'Revisão do trimestre', 'Extra', 'Extra'])
                   [row_number() over (partition by t.id order by d)]
         end
  from public.ebd_trimestres t,
       generate_series(t.inicio + ((7 - extract(dow from t.inicio)::int) % 7), t.fim, interval '7 days') d
  where t.church_id = v_sede;

  -- Uma criança dos Primários já fez 9 anos: a promoção sugere os Juniores.
  update public.rol_membros set nascimento = date '2017-08-10'
  where church_id = v_sede and nome = 'Bento Moreira';

  -- Responsáveis: os pais que estão em Membros (nome e telefone vêm de lá)...
  insert into public.rol_responsaveis (church_id, membro_id, responsavel_id, parentesco, pode_buscar)
  select v_sede, c.id, p.id, x.parentesco, true
  from (values ('Pedro Ferreira', 'Antônio Ferreira', 'Pai'), ('Sofia Almeida', 'Bruna Almeida', 'Mãe'),
               ('Lucas Melo', 'Francisco Melo', 'Pai'), ('Helena Pires', 'Glória Pires', 'Mãe'),
               ('Bento Moreira', 'Paulo Moreira', 'Pai'), ('Cecília Ribeiro', 'Marta Ribeiro', 'Mãe')) as x(crianca, pai, parentesco)
  join public.rol_membros c on c.church_id = v_sede and c.nome = x.crianca
  join public.rol_membros p on p.church_id = v_sede and p.nome = x.pai;
  -- ...e quem não está no rol, só com nome e telefone.
  insert into public.rol_responsaveis (church_id, membro_id, nome, telefone, parentesco, pode_buscar)
  select v_sede, c.id, x.nome, x.tel, x.parentesco, x.busca
  from (values ('Pedro Ferreira', 'Dona Cida', '11966661111', 'Avó', true),
               ('Miguel Dias', 'Roberta Dias', '11966662222', 'Mãe', true),
               ('Laura Neves', 'Carlos Neves', '11966663333', 'Pai', true),
               ('Gael Campos', 'Ana Campos', '11966664444', 'Mãe', true),
               ('Isis Cardoso', 'Tio Beto', '11966665555', 'Tio', false)) as x(crianca, nome, tel, parentesco, busca)
  join public.rol_membros c on c.church_id = v_sede and c.nome = x.crianca;

  update public.rol_membros set cuidados = 'Alergia a amendoim. Tem bombinha de asma na mochila.'
  where church_id = v_sede and nome = 'Sofia Almeida';

  -- Visitante dos Juniores que voltou e espera matrícula.
  insert into public.ebd_visitantes (aula_id, classe_id, church_id, nome, telefone)
  select a.id, k_juniores, v_sede, 'Theo Santos (veio com a avó)', '11977776666'
  from public.ebd_aulas a where a.classe_id = k_juniores and a.data = v_dom;
end $$;

-- EBD da Demo Subsede Norte (para a sede ver números da rede) e títulos da
-- revista dos Juniores em algumas lições.
do $$
declare
  v_dom date := current_date - extract(dow from current_date)::int;
  v_norte uuid;
  v_sede uuid;
  k_norte uuid;
  v_aula uuid;
  v_aluno record;
  s int;
  i int;
begin
  select id into v_norte from public.churches where slug = 'demo-norte';
  select id into v_sede from public.churches where slug = 'demo-sede';

  insert into public.ebd_classes (church_id, nome, faixa_etaria, ordem, idade_minima)
  values (v_norte, 'Classe única', 'todas as idades', 1, null) returning id into k_norte;
  insert into public.ebd_matriculas (classe_id, membro_id, church_id, desde)
  select k_norte, id, v_norte, v_dom - 40 from public.rol_membros
  where church_id = v_norte and user_id is null and deleted_at is null;

  for s in 0 .. 3 loop
    insert into public.ebd_aulas (classe_id, church_id, data, biblias, revistas, oferta_centavos)
    values (k_norte, v_norte, v_dom - 7 * s, 4, 4, 1500) returning id into v_aula;
    i := 0;
    for v_aluno in select membro_id from public.ebd_matriculas where classe_id = k_norte loop
      i := i + 1;
      insert into public.ebd_presencas (aula_id, membro_id, classe_id, church_id, estado)
      values (v_aula, v_aluno.membro_id, k_norte, v_norte, case when (i + s) % 4 = 0 then 'ausente' else 'presente' end);
    end loop;
  end loop;

  -- Juniores usam outra revista: títulos próprios nas lições 12 e 13 do trimestre anterior.
  insert into public.ebd_licao_titulos (licao_id, classe_id, church_id, titulo)
  select l.id, k.id, v_sede, case l.numero when 12 then 'Deus mora conosco (revista infantil)' else 'Revisão com jogos bíblicos' end
  from public.ebd_licoes l
  join public.ebd_trimestres t on t.id = l.trimestre_id and t.church_id = v_sede and t.inicio < current_date - 30
  join public.ebd_classes k on k.church_id = v_sede and k.nome = 'Juniores'
  where l.numero in (12, 13);
end $$;

-- Pedidos de visita da Demo Sede: pendentes e já visitados, em datas variadas.
do $$
declare v_sede uuid;
begin
  select id into v_sede from public.churches where slug = 'demo-sede';
  insert into public.visitors (church_id, name, contact, endereco, mensagem, created_at, visitado_em, visitado_por, visita_obs)
  values
    (v_sede, 'Dona Cecília Ramos', '(11) 98123-4501', 'Rua das Acácias, 120 - Vila Nova', 'Estou acamada depois de uma cirurgia e gostaria de uma oração em casa.', now() - interval '1 day', null, null, null),
    (v_sede, 'Marcos Vieira', '(11) 97654-3302', 'Jardim Primavera', 'Perdi meu pai mês passado. Queria conversar com o pastor.', now() - interval '3 days', null, null, null),
    (v_sede, 'Família Albuquerque', '(11) 99876-1203', 'Av. Brasil, 845, ap. 32', null, now() - interval '6 days', null, null, null),
    (v_sede, 'Sr. Antônio Pires', '(11) 96543-2104', 'Rua São Bento, 77', 'Tenho 82 anos e não consigo mais ir aos cultos.', now() - interval '12 days', null, null, null),
    (v_sede, 'Juliana Costa', '(11) 95432-1005', 'Centro', 'Quero conhecer a fé, mas tenho vergonha de ir sozinha.', now() - interval '20 days', null, null, null),
    (v_sede, 'Rogério e Paula Menezes', '(11) 98765-0906', 'Vila Esperança', 'Passamos por uma fase difícil no casamento.', now() - interval '9 days', current_date - 5, 'Pr. Demo Sede e irmã Marta', 'Oramos juntos; voltaram ao culto de domingo.'),
    (v_sede, 'Helena Duarte', '(11) 97777-2107', 'Rua do Comércio, 400', 'Minha mãe está internada.', now() - interval '18 days', current_date - 15, 'Pb. Carlos', 'Visita no hospital, família muito grata.'),
    (v_sede, 'Seu Joaquim Lima', '(11) 96666-3308', 'Sítio Boa Vista', null, now() - interval '35 days', current_date - 30, 'Pr. Demo Sede', null),
    (v_sede, 'Bianca Freitas', '(11) 95555-4409', 'Parque das Flores', 'Gostaria de batizar meus filhos.', now() - interval '50 days', current_date - 44, 'Diác. Roberto', 'Encaminhada para a classe de novos convertidos.'),
    (v_sede, 'Tereza Nogueira', '(11) 94444-5510', 'Vila Nova', 'Meu marido está desempregado e desanimado.', now() - interval '75 days', null, null, null);
end $$;

-- Etapas dos pedidos de visita da Demo Sede: contato feito e quem visitou.
do $$
declare v_sede uuid; v_pastor uuid; v_outro uuid;
begin
  select id into v_sede from public.churches where slug = 'demo-sede';
  -- O pastor (login do responsável) e mais um membro com cargo, para a contagem por pessoa.
  select m.id into v_pastor from public.rol_membros m join auth.users u on u.id = m.user_id
  where m.church_id = v_sede and u.email = 'pastor.demo.sede@dev.local';
  select m.id into v_outro from public.rol_membros m
  join public.rol_membro_cargos rc on rc.membro_id = m.id
  where m.church_id = v_sede and m.deleted_at is null and m.id <> v_pastor
  order by m.nome limit 1;

  -- Visitados: o contato veio dois dias antes da visita.
  update public.visitors set contato_em = visitado_em - 2
  where church_id = v_sede and visitado_em is not null and contato_em is null;
  insert into public.visita_participantes (visitor_id, membro_id, church_id)
  select v.id, v_pastor, v_sede from public.visitors v
  where v.church_id = v_sede and v.visitado_em is not null and v_pastor is not null
  on conflict do nothing;
  insert into public.visita_participantes (visitor_id, membro_id, church_id)
  select v.id, v_outro, v_sede from public.visitors v
  where v.church_id = v_sede and v.visitado_em is not null and v.name in ('Rogério e Paula Menezes', 'Bianca Freitas')
    and v_outro is not null
  on conflict do nothing;

  -- Em andamento: já falaram com dois; um com a visita marcada.
  update public.visitors
  set contato_em = current_date - 1, agendada_para = current_date + 2, contato_obs = 'Prefere à tarde; a filha atende o telefone.'
  where church_id = v_sede and name = 'Sr. Antônio Pires' and visitado_em is null;
  update public.visitors
  set contato_em = current_date - 3, contato_obs = 'Vai avisar o melhor dia.'
  where church_id = v_sede and name = 'Juliana Costa' and visitado_em is null;
end $$;

-- Pedidos de oração da Demo Sede: alguns aguardando, outros já orados.
do $$
declare v_sede uuid;
begin
  select id into v_sede from public.churches where slug = 'demo-sede';
  if exists (select 1 from public.prayer_requests where church_id = v_sede) then return; end if;
  insert into public.prayer_requests (church_id, name, message, created_at, orado_em, anotacao) values
    (v_sede, 'Marlene', 'Peço oração pela saúde do meu esposo, que fará uma cirurgia na próxima semana.', now() - interval '5 hours', null, null),
    (v_sede, null, 'Estou desempregado há seis meses e desanimado. Orem por uma porta aberta.', now() - interval '1 day', null, null),
    (v_sede, 'Rafael Souza', 'Pela restauração do meu casamento.', now() - interval '3 days', null, 'O pastor ligou na quinta; pediu para continuar orando.'),
    (v_sede, 'Dona Ivone', 'Pelo meu neto, que se afastou da igreja.', now() - interval '6 days', null, null),
    (v_sede, null, 'Agradeço a Deus por um livramento e peço oração pela minha família.', now() - interval '9 days', now() - interval '7 days', null),
    (v_sede, 'Cláudio', 'Pela minha mãe, que está internada.', now() - interval '15 days', now() - interval '14 days', 'Visitada no hospital.'),
    (v_sede, 'Jovem da igreja', 'Pelas provas do vestibular.', now() - interval '30 days', now() - interval '28 days', null);
end $$;

drop function public.__demo_rol_pequeno(uuid, text, int, date);
drop function public.__demo_cargo(uuid, text);
drop function public.__demo_presenca(uuid, date, uuid, text);
drop function public.__demo_cultos(uuid);
drop function public.__demo_church(text, text, text, uuid, text, text);
drop function public.__demo_user(text, text);
