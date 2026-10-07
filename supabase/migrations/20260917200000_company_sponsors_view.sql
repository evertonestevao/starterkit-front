-- A igreja passa a ver quem a patrocina.
--
-- Não dá para a igreja ler `sponsor_accounts` direto: lá tem CPF/CNPJ,
-- email, telefone e os ids do gateway do patrocinador. Nada disso é da
-- conta dela. Esta RPC devolve exatamente o que a igreja precisa saber —
-- nome de exibição, logo, desde quando e a situação — e nada além.
--
-- Também NÃO devolve valor. O dinheiro do patrocínio custeia a plataforma,
-- não é repassado à igreja; mostrar "R$ 39,90" no painel dela criaria a
-- expectativa errada, justo o contrário do que a página de convite explica
-- para o patrocinador.
create or replace function public.list_company_sponsors(p_company_id uuid)
returns table (
  sponsorship_id uuid,
  church_id uuid,
  church_name text,
  sponsor_name text,
  logo_url text,
  status text,
  activated_at timestamptz,
  ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- security definer ignora RLS: a checagem de acesso é esta linha.
  if not public.is_company_member(p_company_id) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    s.id,
    s.church_id,
    c.name,
    sa.display_name,
    sa.logo_url,
    s.status,
    s.activated_at,
    s.ends_at
  from public.sponsorships s
  join public.churches c on c.id = s.church_id
  join public.sponsor_accounts sa on sa.id = s.sponsor_id
  where s.company_id = p_company_id
    -- Mesmo recorte da vitrine pública: quem aparece na página da igreja.
    and s.status in ('active', 'cancel_scheduled')
    and sa.deleted_at is null
  order by s.activated_at desc nulls last, s.created_at desc;
end;
$$;

revoke all on function public.list_company_sponsors(uuid) from public, anon, authenticated;
grant execute on function public.list_company_sponsors(uuid) to authenticated;
