-- Mensalidade pendente: 14 dias de tolerância, aviso e suspensão do painel.
--
-- Até aqui, não pagar a mensalidade não aparecia em lugar nenhum. Agora:
--   * durante a tolerância (14 dias corridos), quem administra a igreja vê um
--     aviso no topo do painel, com a data até quando pode regularizar;
--   * passada a tolerância, o painel da igreja fica suspenso: só resta a tela
--     da mensalidade, para pagar e reativar. Nada é apagado, e a suspensão
--     acaba sozinha quando o pagamento é confirmado.
--
-- Esta migration só RESPONDE "está pendente? desde quando? até quando vai a
-- tolerância? está suspensa?". Quem age sobre a resposta é o painel.
--
-- Quando a mensalidade está pendente:
--   * há uma fatura vencida e não paga (pendente desde o vencimento); ou
--   * a igreja nunca teve a mensalidade em dia — não cadastrou o pagamento, ou
--     cadastrou e não concluiu (pendente desde a criação da igreja).
-- Não está pendente a igreja com patrocinador ativo: ele cobre a mensalidade.
--
-- A tolerância fica em `platform_settings`, para a plataforma poder mudar sem
-- nova versão.

alter table public.platform_settings
  add column if not exists mensalidade_tolerancia_dias integer not null default 14
    check (mensalidade_tolerancia_dias between 0 and 90);

comment on column public.platform_settings.mensalidade_tolerancia_dias is
  'Dias corridos de tolerância depois que a mensalidade da igreja fica pendente; passados, o painel é suspenso.';

-- A consulta em si, SEM checar quem pergunta: não é chamável por ninguém de
-- fora, só pelas duas funções abaixo, que decidem quem pode saber o quê.
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
    select c.id, c.name, c.created_at::date as criada_em,
           (select a.id from public.sponsor_accounts a
             where a.church_id = c.id and a.is_self_payment and a.deleted_at is null) as conta
    from public.churches c
    where c.company_id = p_company_id
      and c.deleted_at is null
      -- Com patrocinador ativo, a mensalidade está coberta.
      and public.church_real_billable_sponsorships(c.id) = 0
  ), situacao as (
    select i.*,
      -- A fatura vencida mais antiga ainda em aberto.
      (select min(ch.due_date) from public.sponsor_charges ch
        where ch.sponsor_id = i.conta and ch.status in ('pending', 'overdue')
          and ch.due_date < public.hoje_local()) as vencida_desde,
      -- A mensalidade já esteve em dia alguma vez (há patrocínio próprio ativo).
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

-- O detalhe (qual igreja, por quê, desde quando) só para quem ADMINISTRA a
-- empresa: a situação financeira da igreja não é assunto de quem só faz a
-- chamada ou dá aula.
create or replace function public.mensalidades_pendentes(p_company_id uuid)
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
  select b.church_id, b.church_name, b.motivo, b.desde, b.tolerancia_ate
  from public.mensalidades_pendentes_base(p_company_id) b
  where public.is_company_admin(p_company_id);
$$;

revoke all on function public.mensalidades_pendentes(uuid) from public, anon, authenticated;
grant execute on function public.mensalidades_pendentes(uuid) to authenticated;

-- O painel está suspenso? Qualquer pessoa DA empresa pode saber (ela precisa
-- entender por que não entra), mas só isto: sim ou não, sem motivo nem valor.
-- Quem não é da empresa recebe sempre "não".
create or replace function public.mensalidade_bloqueada(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_company_member(p_company_id)
     and exists (
       select 1 from public.mensalidades_pendentes_base(p_company_id) b
       where b.tolerancia_ate < public.hoje_local()
     );
$$;

revoke all on function public.mensalidade_bloqueada(uuid) from public, anon, authenticated;
grant execute on function public.mensalidade_bloqueada(uuid) to authenticated;

notify pgrst, 'reload schema';
