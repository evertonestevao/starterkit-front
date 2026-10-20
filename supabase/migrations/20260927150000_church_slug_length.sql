-- ---------------------------------------------------------------------------
-- Endereço público da igreja: sempre de 3 a 40 caracteres
-- ---------------------------------------------------------------------------
-- `churches_public_code_formato` exige 3 a 40 caracteres, mas o slug que o
-- onboarding manda (slugify) chega a 50 e não tem mínimo. Resultado: um nome
-- como "Assembleia de Deus Ministério no Ipiranga" (41 no slug) fazia a criação
-- da igreja falhar com "Falha ao criar igreja". O gerador é quem sabe a regra do
-- banco, então é ele que ajusta: corta no limite (sem terminar em hífen),
-- reserva espaço para o sufixo de desempate e completa nomes curtos demais.

create or replace function public.next_available_church_slug(p_base text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_base text := coalesce(nullif(trim(p_base), ''), 'igreja');
  v_candidate text;
  v_suffix integer := 1;
  v_tail text;
begin
  -- Nome de 1–2 letras daria um endereço curto demais.
  if char_length(v_base) < 3 then
    v_base := v_base || '-igreja';
  end if;

  v_candidate := regexp_replace(left(v_base, 40), '-+$', '');

  while exists (
    select 1 from public.churches
    where slug = v_candidate or public_code = v_candidate
  ) loop
    v_suffix := v_suffix + 1;
    v_tail := '-' || v_suffix;
    v_candidate := regexp_replace(left(v_base, 40 - char_length(v_tail)), '-+$', '') || v_tail;
    -- Trava de segurança: nunca virar laço infinito por causa de dado torto.
    if v_suffix > 999 then
      v_tail := '-' || substr(gen_random_uuid()::text, 1, 8);
      v_candidate := regexp_replace(left(v_base, 40 - char_length(v_tail)), '-+$', '') || v_tail;
      exit;
    end if;
  end loop;

  return v_candidate;
end;
$$;

revoke all on function public.next_available_church_slug(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
