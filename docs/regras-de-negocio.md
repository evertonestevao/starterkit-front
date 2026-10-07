# Regras de negócio combinadas e ainda NÃO implementadas

Este arquivo guarda decisões já tomadas que **não estão no código**. Nada aqui
existe hoje: são regras para uma próxima fase, registradas para não se
perderem e para que ninguém implemente "meio" delas por engano.

O que já está implementado vive no código e nos testes — em especial
`supabase/tests/rls_test.sql`, que é onde as regras de acesso são provadas.

## 1. Pagador de fallback: a igreja pode assumir a própria mensalidade

Hoje quem paga a plataforma é o patrocinador. A regra combinada:

- Igreja **sem nenhum patrocinador** pode assumir a mensalidade dela mesma.
- Quando um patrocinador entrar, a igreja **deixa de pagar** — o patrocínio
  assume o lugar, sem a igreja precisar cancelar nada.
- A volta também vale: se o último patrocinador sair, a igreja volta a ser a
  pagadora (com aviso antes, nunca cobrança surpresa).

Pontos a decidir antes de implementar:

- O que acontece com o ciclo já pago pela igreja quando um patrocinador entra
  no meio dele (crédito, reembolso ou simplesmente segue até o fim do ciclo).
- Se a igreja pagante aparece de alguma forma na própria página pública.
- Qual o valor da mensalidade da igreja — hoje a tabela de preços
  (`sponsor_price_tiers`) é por POSIÇÃO de patrocínio e não serve para isso.

## 2. Acesso só se perde quando NENHUM pagador está em dia

- A igreja só perde acesso quando **nenhum** pagador — nem ela, nem qualquer
  patrocinador dela — está em dia.
- Antes da suspensão: carência configurável e **aviso**. Nunca cortar sem
  avisar quem paga e quem lidera a igreja.
- Enquanto qualquer pagador estiver em dia, nada muda para a igreja.

Isso é diferente da carência da marca do patrocinador, que já existe hoje
(`platform_settings.carencia_marca_dias`): aquela tira só a MARCA da vitrine,
e não afeta a igreja em nada.

## 3. Página suspensa

Quando a suspensão acontecer, a página pública da igreja continua no ar, mas
reduzida:

- Mostra **apenas o nome e o endereço** da igreja.
- **Nenhum botão**: sem dízimo, sem inscrição em evento, sem pedido de oração,
  sem patrocinador.
- Uma mensagem **carinhosa** para quem chegou ali: tom acolhedor, convidando a
  procurar a igreja pessoalmente. Nada de "conta suspensa", "pagamento
  pendente" ou qualquer palavra que exponha a situação financeira da igreja
  para a comunidade dela.
- O prazo de inadimplência até a página ser reduzida é **configurável pelo
  admin da plataforma** (sugestão inicial: 30 dias), na mesma tela de
  `/plataforma/configuracoes`.

Lembrete de implementação: a cláusula 10.3 dos Termos da igreja promete que a
página sai do ar quando a conta é encerrada. Suspensão por inadimplência é
outra coisa, e o texto dos Termos precisa cobrir as duas antes de a regra
entrar no ar.
