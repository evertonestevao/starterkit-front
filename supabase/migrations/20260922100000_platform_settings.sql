-- ---------------------------------------------------------------------------
-- Configurações da plataforma
-- ---------------------------------------------------------------------------
-- Duas regras do negócio deixam de ser número fixo no código e passam a ser
-- ajustáveis pelo dono da plataforma:
--
--   1. Quantas VAGAS de primeiro patrocínio cada tipo de igreja aceita.
--      Null = ilimitado (o estado inicial). "Primeiro patrocínio" é a
--      assinatura inicial do patrocinador, a igreja principal dele;
--      expansões (2ª, 3ª...) nunca ocupam vaga nem são limitadas.
--
--   2. Quantos dias de ATRASO o patrocinador tem antes de a marca dele sair
--      da vitrine da igreja. A visibilidade é calculada na hora da leitura,
--      a partir da data de vencimento em atraso e do valor ATUAL daqui —
--      baixar de 15 para 7 vale no próximo acesso à página, sem reprocessar
--      nada e sem job.
--
-- Linha ÚNICA (id = 1): são configurações da plataforma, não de um tenant.
-- Nenhum client lê nem escreve a tabela direto; as funções abaixo são
-- security definer e a de escrita é só para `platform_staff`, com registro em
-- `platform_staff_actions`.

create table if not exists public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  -- Null = ilimitado. Zero = nenhuma vaga nova (fecha para novos).
  vagas_primeiro_sede integer check (vagas_primeiro_sede is null or vagas_primeiro_sede >= 0),
  vagas_primeiro_subsede integer check (vagas_primeiro_subsede is null or vagas_primeiro_subsede >= 0),
  vagas_primeiro_congregacao integer check (vagas_primeiro_congregacao is null or vagas_primeiro_congregacao >= 0),
  carencia_marca_dias integer not null default 15 check (carencia_marca_dias >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.platform_settings is
  'Linha única com as configurações da plataforma. Só platform_staff altera.';

insert into public.platform_settings (id) values (1)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
-- Sem policy: nem com GRANT alguém chegaria às linhas. O acesso é pelas
-- funções security definer abaixo, que rodam como dona da tabela.

-- Leitura pelo painel da plataforma.
create or replace function public.platform_get_settings()
returns public.platform_settings
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.platform_settings;
begin
  if not public.is_platform_staff() then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.platform_settings where id = 1;
  return v_row;
end;
$$;

-- Escrita. Todos os campos vêm juntos (é um formulário só); null em vagas
-- significa ilimitado, e por isso não dá para usar "null = não mexer".
create or replace function public.platform_update_settings(
  p_vagas_sede integer,
  p_vagas_subsede integer,
  p_vagas_congregacao integer,
  p_carencia_marca_dias integer
)
returns public.platform_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes public.platform_settings;
  v_depois public.platform_settings;
begin
  if not public.is_platform_staff() then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  if p_carencia_marca_dias is null or p_carencia_marca_dias < 0 then
    raise exception 'carencia da marca precisa ser um numero inteiro de dias, zero ou mais'
      using errcode = 'check_violation';
  end if;

  select * into v_antes from public.platform_settings where id = 1;

  update public.platform_settings
  set vagas_primeiro_sede = p_vagas_sede,
      vagas_primeiro_subsede = p_vagas_subsede,
      vagas_primeiro_congregacao = p_vagas_congregacao,
      carencia_marca_dias = p_carencia_marca_dias,
      updated_at = now(),
      updated_by = auth.uid()
  where id = 1
  returning * into v_depois;

  insert into public.platform_staff_actions (staff_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'platform.settings.update',
    'platform_settings',
    null,
    jsonb_build_object(
      'antes', jsonb_build_object(
        'vagas_sede', v_antes.vagas_primeiro_sede,
        'vagas_subsede', v_antes.vagas_primeiro_subsede,
        'vagas_congregacao', v_antes.vagas_primeiro_congregacao,
        'carencia_marca_dias', v_antes.carencia_marca_dias
      ),
      'depois', jsonb_build_object(
        'vagas_sede', v_depois.vagas_primeiro_sede,
        'vagas_subsede', v_depois.vagas_primeiro_subsede,
        'vagas_congregacao', v_depois.vagas_primeiro_congregacao,
        'carencia_marca_dias', v_depois.carencia_marca_dias
      )
    )
  );

  return v_depois;
end;
$$;

revoke all on function public.platform_get_settings() from public, anon, authenticated;
revoke all on function public.platform_update_settings(integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.platform_get_settings() to authenticated;
grant execute on function public.platform_update_settings(integer, integer, integer, integer) to authenticated;

notify pgrst, 'reload schema';
