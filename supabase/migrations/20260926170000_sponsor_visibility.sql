-- Patrocinador escolhe se aparece na vitrine pública da igreja.
--
-- Diferente de display_name/logo_url/link (migration 20260918120000): não é
-- CONTEÚDO que uma conta invadida poderia desfigurar, é um liga/desliga do
-- que já foi aprovado. Mesmo grau de confiança que `phone` já tem hoje —
-- escrita direta, sem passar pela moderação.

alter table public.sponsor_accounts
  add column if not exists visible_on_page boolean not null default true;

comment on column public.sponsor_accounts.visible_on_page is
  'Escolha do próprio patrocinador. Escrita direta (não é conteúdo moderado).';

grant update (visible_on_page) on public.sponsor_accounts to authenticated;
-- O cadastro de quem já está logado (createMyAccount) insere pelo client do
-- próprio usuário — sem este GRANT, escolher "não aparecer" já no cadastro
-- falharia. O outro caminho de criação (fluxo público, sem sessão) usa
-- service_role e não depende de GRANT nenhum.
grant insert (visible_on_page) on public.sponsor_accounts to authenticated;

-- A vitrine só mostra quem está ativo, não escondido pela igreja, sem
-- carência vencida, não é autopatrocínio da própria igreja, e que topou
-- aparecer. `create or replace` não pode mudar o tipo de retorno de uma
-- função existente — por isso a assinatura aqui precisa ser exatamente a da
-- versão vigente (migration 20260926160000), só com a condição nova.
create or replace function public.list_church_sponsors(p_church_id uuid)
returns table (
  sponsorship_id uuid,
  display_name text,
  logo_url text,
  link_tipo text,
  link_valor text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select s.id, sa.display_name, sa.logo_url, sa.link_tipo, sa.link_valor
  from public.sponsorships s
  join public.sponsor_accounts sa on sa.id = s.sponsor_id
  where s.church_id = p_church_id
    and s.status in ('active', 'cancel_scheduled')
    and sa.deleted_at is null
    and not sa.is_self_payment
    and sa.visible_on_page
    and s.hidden_at is null
    and not public.sponsor_fora_da_vitrine(s.sponsor_id)
  order by s.created_at asc, s.id asc;
$fn$;

revoke all on function public.list_church_sponsors(uuid) from public, anon, authenticated;
-- A vitrine é pública: a página da igreja abre sem login.
grant execute on function public.list_church_sponsors(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
