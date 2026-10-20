-- Secretário(a) da EBD deixa de ver o Painel por padrão.
--
-- O Painel traz números da igreja inteira; quem só cuida da Escola Dominical
-- entra direto na EBD (Resumo) — a tela inicial já vai para o primeiro menu
-- liberado quando a pessoa não tem o Painel (src/lib/menuPermissoes.ts).
-- Quem tem OUTRO cargo com Painel continua vendo: os acessos somam.
--
-- O Responsável ainda pode liberar o Painel para o cargo na tela de Acessos.

update public.cargos
   set acessos_padrao = array_remove(acessos_padrao, 'dashboard')
 where slug = 'secretario_ebd';

-- Igrejas que já gravaram a própria configuração copiaram o padrão antigo:
-- acompanham a mudança (ainda não há igreja em produção com escolha própria).
update public.cargo_acessos ca
   set permitido = false
  from public.cargos c
 where c.id = ca.cargo_id
   and c.slug = 'secretario_ebd'
   and ca.modulo = 'dashboard'
   and ca.permitido;
