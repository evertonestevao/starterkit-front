# Operação do módulo de revendedores

Passo a passo para quem administra o sistema (super admin). O painel fica em `/admin/revendedores`.

## Antes de começar

1. **Dar o acesso de super admin.** Com a conta já criada no sistema, rode no banco, trocando o e-mail:

   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users where email = 'seu-email@exemplo.com';
   ```

2. **Configurar o Asaas.** Siga o roteiro de `.env.example`: variáveis `ASAAS_*` e webhook em `https://SEU-DOMINIO/api/webhooks/asaas`, com todos os eventos listados lá. Teste no sandbox primeiro.

3. **Criar a regra padrão.** Em **Regras e planos**, crie uma regra com "Todos os vendedores" e "Todos os planos". Sem nenhuma regra aplicável, a venda não gera comissão.

4. **Ligar o módulo.** Em **Vendedores**, clique em **Ligar módulo**.

## Cadastrar um vendedor

1. Em **Vendedores**, preencha **Nome** e **E-mail**. O código de indicação é opcional: vazio, o sistema gera um.
2. Clique em **Enviar convite**. O vendedor recebe um e-mail para definir a senha e, no primeiro acesso, aceita os termos.
3. Se o e-mail não chegar, abra a página do vendedor e use **Reenviar convite**.

Se a pessoa já tem conta no sistema, ela continua com a mesma senha e passa a ver a área do vendedor.

**Suspender:** na página do vendedor, **Suspender vendedor** bloqueia o painel dele e novas vendas. Os lançamentos ficam, e os clientes que ele já trouxe continuam gerando comissão.

**Trocar o código:** vale para novos cliques. Links antigos deixam de funcionar, então avise o vendedor.

## Liberar um plano

1. Em **Regras e planos**, clique em **Liberar** no plano. Todo plano nasce escondido.
2. Confira se existe regra que cubra esse plano.

**Esconder** afeta só novas vendas: clientes antigos seguem gerando comissão.

## Como a comissão é escolhida

Vale a regra mais específica: do vendedor antes da global; de plano antes da genérica; por fim, a maior faixa ("a partir da venda nº") que a venda alcança.

A regra é copiada para o cliente na contratação. **Mudar uma regra não altera clientes já vinculados.** Para mudar um cliente, abra a página do vendedor e use **Ajustar comissão**, que vale só para os próximos lançamentos. Para corrigir um mês já lançado, use **Corrigir valor** no lançamento, em **Lançamentos**. Tudo fica no histórico.

## Fechar o mês

1. Em **Lançamentos**, filtre o período (De e Até) e, se quiser, vendedor, plano e status **Pendente**.
2. Clique em **Exportar comissões do mês (CSV)**. O arquivo traz os lançamentos e o total por vendedor, respeitando os filtros. Sem período na tela, sai o mês atual. Lançamentos revertidos aparecem na lista, mas não entram nos totais.
3. Confira os lançamentos marcados com **Estornado depois de pago**: o sistema não desconta esses valores sozinho, e o acerto é seu.
4. Pague os vendedores por fora (Pix, por exemplo).
5. De volta à lista, marque os lançamentos pagos (ou **Selecionar todos os pendentes**; o total selecionado aparece ao lado), informe a **Data do pagamento** e clique em **Marcar selecionados como pagos**. Lançamento já pago não é alterado se for selecionado de novo.

A lista mostra até 200 lançamentos por vez. Se houver mais, filtre por vendedor ou período antes de marcar em lote.

## Reprocessar uma falha de comissão

Quando o registro de uma comissão falha, o pagamento do cliente segue normal e o evento fica em **Alertas e falhas**.

1. Abra **Alertas e falhas** e leia o erro em **Falhas de comissão pendentes**.
2. Se a causa foi resolvida, clique em **Reprocessar**. É seguro repetir: nunca gera lançamento em dobro.
3. Resolvida, a linha some da lista. Se falhar de novo, ela continua lá com mais uma tentativa contada.

## Vendas sem regra

Em **Alertas e falhas**, **Vendas sem regra de comissão** lista clientes que chegaram por um vendedor quando nenhuma regra se aplicava. Eles **não ficaram vinculados**. Criar a regra resolve só as próximas vendas; hoje não há botão para vincular esses clientes depois.

## Desligar o módulo

Em **Vendedores**, **Desligar módulo** pausa as novas vendas: o link é ignorado e ninguém novo é vinculado. Quem já vendeu continua gerando comissão e vendo clientes e comissões; só a tela **Meu link** fica bloqueada.

Suspender um vendedor ou desligar o módulo pode levar até 1 minuto para valer nos cliques do link.

## Exclusão de conta de vendedor

O próprio vendedor não consegue excluir a conta enquanto tiver comissão pendente: a tela pede para falar com você. Depois de quitar e marcar como pago, ele consegue. Os lançamentos ficam para o seu controle, com nome e e-mail do vendedor anonimizados.
