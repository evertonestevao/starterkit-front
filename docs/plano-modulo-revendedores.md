# Plano: módulo de revendedores no Starter Kit

Status: **implementado (Fases 1 a 6) na branch `feat/resellers`, sem merge nem produção.** Falta validar no sandbox do Asaas. Operação: `docs/operacao-revendedores.md`.
Data: 30/10/2026

## 1. Objetivo

Permitir que outras pessoas vendam os sistemas da EverApps por comissão, com o controle todo na mão do super_admin. O módulo vive dentro do Starter Kit, é opcional e fica desligado por padrão.

## 2. Decisões confirmadas

- **Modelo:** o revendedor só **indica**. O Asaas cobra o cliente automaticamente; você repassa a comissão ao vendedor em um dia combinado.
- **Onde fica:** módulo dentro do starter (cada sistema tem o seu). O hub central só é criado quando houver muitos sistemas (seção 11).
- **Gateway:** somente **Asaas** por enquanto, mas construído com uma interface de adaptador (seção 7).
- **Comissão sobre o valor bruto.** O desconto de taxas é calculado por você, por fora.
- **Edições valem só para os próximos lançamentos.** Exemplo: cliente de R$ 100/mês com 30%. Jan a mar geraram R$ 30 cada. Mudando para 40% em abril, abril em diante gera R$ 40 e jan a mar continuam R$ 30. Para corrigir um mês antigo, edita-se aquele lançamento específico.
- **Histórico de alterações:** toda mudança em regras, vínculos e lançamentos fica registrada (quem, quando, de quanto para quanto).
- **Pagamento da comissão ao vendedor:** manual no começo. Você paga por fora (Pix, por exemplo) e marca como "pago" no painel.

## 3. Regras de comissão

- Tipo: **percentual** ou **valor fixo**.
- Configurável por **vendedor**, por **produto** ou por **plano**, além de um padrão global.
- **Faixas por nº da venda (opcional, configurável por sistema):** exemplo, 30% nas 3 primeiras vendas e 40% da 4ª em diante. É um campo opcional "a partir da venda nº" no formulário da regra. Se não for usado, a regra vale sempre. A contagem é por produto, dentro do sistema (cada sistema tem suas próprias regras e contagem).
- **Duração (opcional por regra e por cliente):**
  - vazio = paga **enquanto o cliente estiver pagando** (padrão)
  - número = paga por **X meses**
- **Ajuste por cliente:** você pode editar percentual, valor ou duração de um cliente específico (marcado como `is_override`).
- **Qual regra vale** (da mais específica à mais geral): regras do vendedor antes das globais; dentro delas, plano antes de produto, produto antes da genérica; por fim, a maior faixa que se aplica à venda.

## 4. Visibilidade de planos

- Cada plano tem a flag `available_to_resellers`, **desligada por padrão**.
- O vendedor só vê e só pode vender os planos que você liberou.
- Esconder um plano afeta só **novas** vendas. Clientes antigos continuam gerando comissão e aparecendo para o vendedor.

## 5. Link de afiliado

- O vendedor compartilha `sistema.com/r/CODIGO` (ou `?ref=CODIGO`). Serve também para impulsionamento, porque o link do anúncio já carrega o código.
- Ao abrir, o **servidor** grava o código num cookie e **redireciona para a página limpa**, sem o parâmetro na barra de endereço. Quem copiar o link da barra não leva o código junto.
- Cookie definido no servidor (dura mais que o de JavaScript, que o Safari limita a 7 dias), com validade de cerca de **30 dias**.
- **Vale o primeiro vendedor** que trouxe o cliente.
- **Auto-indicação bloqueada:** o vendedor não ganha comissão comprando pelo próprio link.
- Código inválido ou de vendedor suspenso é ignorado em silêncio.
- No painel do vendedor, uma tela **"Meu link"** com botão de copiar para cada plano liberado.
- O código fica gravado no cadastro do cliente e é usado para criar o vínculo cliente-vendedor.

## 6. Login do vendedor e o que ele vê

### Cadastro e login

- **Só o super_admin cadastra vendedores.** Não existe tela de auto-cadastro. Você informa nome e e-mail (o código de indicação é gerado e pode ser editado), e o sistema envia um convite por e-mail para o vendedor definir a senha.
- **Login pelo mesmo formulário do sistema** (mesma conta de autenticação). Depois de entrar, quem tem cadastro de vendedor é levado para a área `/vendedor`, separada da área dos clientes (tenants). O vendedor não precisa pertencer a nenhum tenant.
- **Quem é vendedor** é definido só pela tabela `resellers`, que só o super_admin altera. Nunca por metadados que o próprio usuário consegue editar.
- **Mesmo e-mail pode ser cliente e vendedor:** a conta é a mesma, e a pessoa escolhe qual área abrir.
- **Suspender um vendedor** bloqueia o acesso ao painel e novas vendas. Os lançamentos já gerados ficam preservados.
- **Preparado para o futuro, mas fechado:** o schema já aceita o status `pending` (aguardando aprovação) e a flag `reseller_self_signup`, desligada. Nenhuma tela de cadastro é criada agora.

### O que ele vê

Somente por views, sem acesso às tabelas internas do sistema:

- **Meu link** (seção 5) e os planos liberados para ele
- **Meus clientes:** nome, plano, nº da venda, comissão (valor ou %) e duração
- **Minhas comissões:** cliente, valor-base, valor da comissão, status (pendente/pago) e datas

Ele **não** enxerga dados internos do cliente nem de outros vendedores.

## 7. Gateway (Asaas) e fluxo de pagamento

**Adaptador de gateway:** a lógica de comissão só conhece eventos padrão ("pagamento recebido", "estornado", "assinatura cancelada"). O Asaas é o primeiro adaptador, que traduz o webhook dele para esses eventos. Para somar outro gateway no futuro, escreve-se só um adaptador novo. O webhook fica em `/api/webhooks/[gateway]`, e a unicidade do lançamento é `gateway + external_payment_id`.

**Fluxo:**
1. Cliente chega pelo link do vendedor e o código fica gravado.
2. Ao contratar um plano liberado, o cliente é vinculado ao vendedor, e a regra é calculada e gravada no vínculo.
3. Quando o Asaas confirma o pagamento (webhook), gera-se **um lançamento** de comissão. Cliente inadimplente ou cancelado não gera lançamento.
4. Em reembolso ou estorno, o lançamento ainda **pendente** é revertido (os já pagos não são mexidos automaticamente).
5. O pagamento repetido do mesmo webhook não duplica lançamento (id único).

Pontos a confirmar na documentação do Asaas: nomes exatos dos eventos de pagamento recebido e estorno, e como autenticar o webhook.

## 8. Liga/desliga do módulo

A flag `resellers_enabled` controla só as **novas vendas**:

- **Desligado:** o link de afiliado é ignorado, ninguém novo é vinculado a vendedor e os planos deixam de aparecer para venda.
- **Continua funcionando:** vendedores que já venderam continuam gerando comissão normalmente a cada pagamento e continuam vendo seus clientes e comissões no painel.

## 9. Fechamento e repasse

- Você repassa em um dia combinado.
- O painel do super_admin tem o botão **"exportar comissões do mês (CSV)"**, com total por vendedor, para fechar em planilha.
- Ao pagar, você marca os lançamentos como "pago" (com a data).

## 10. Entregáveis

Todos implementados, com as diferenças abaixo do texto original:

- **Sem produtos:** o repo não tem catálogo de produtos e cada deploy é um sistema, então regras e filtros usam vendedor e plano, e a contagem de vendas é por vendedor.
- **Pasta:** `src/modules/resellers`, porque o alias e os testes só cobrem `src`.
- **Vínculo:** nasce no checkout, antes do primeiro pagamento.
- **Rota do webhook:** `/api/webhooks/[gateway]`, com `/api/webhooks/payment` mantida para webhooks já cadastrados.

1. [x] **Adaptar o schema** `reseller_schema.sql`:
   - trocar `stripe_invoice_id` por `gateway` + `external_payment_id` (par único)
   - `register_commission` e as views do vendedor deixam de depender da flag de liga/desliga; só o vínculo de novos clientes e o link continuam dependendo dela
   - incluir o status `pending` em `resellers` e a flag `reseller_self_signup` (desligada)
   - ajustar `is_super_admin()` e os nomes das colunas de `plans`, `products` e `tenants`
2. [x] **Link de afiliado:** rota `/r/[codigo]`, cookie no servidor, redirecionamento para a página limpa, bloqueio de auto-indicação.
3. [x] **Adaptador Asaas** e rota de webhook (pagamento recebido e estorno para os eventos padrão).
4. [x] **Painel do super_admin:** ligar/desligar o módulo, cadastrar vendedores por convite (e-mail), suspender vendedores, definir regras, liberar planos, editar por cliente, marcar comissões como pagas. Inclui:
   - **lista de vendedores** com totais (clientes ativos, comissão pendente, comissão paga)
   - **página de cada vendedor** com seus clientes e lançamentos
   - **vendas e lançamentos de todos os vendedores** com filtros por vendedor, produto, plano, status (pendente/pago/revertido) e período
   - ações em lote, como marcar vários lançamentos como pagos
5. [x] **Painel do vendedor** em `/vendedor` (área separada dos tenants, protegida pelo cadastro em `resellers`): meu link, meus clientes, minhas comissões.
6. [x] **Exportar comissões do mês (CSV).**
7. [x] **Testes** das regras de comissão (faixas, duração, override, estorno), do link de afiliado e das policies de RLS.
8. [x] **Pendências das fases seguintes, todas feitas:**
   - bloquear a exclusão de conta de vendedor com comissão pendente
   - incluir os dados de revenda na exportação LGPD
   - exibir o alerta `LINK_NO_RULE` no painel do super_admin

## 11. Preparação para o hub futuro

- **Mesmo código de indicação e mesmo e-mail** do vendedor em todos os sistemas. É o elo para juntar tudo depois.
- **Módulo idêntico** em todo sistema (mesmas tabelas e nomes, vindos do starter).
- **Campos neutros de gateway** e valor calculado gravado em cada lançamento.
- **Código isolado** em uma pasta só (`src/modules/resellers`). Fora dela, só rotas finas em `src/app` e pontos de contato explícitos: `proxy.ts`, layout do dashboard, login, criação de empresa, checkout, webhook e conta.

**Quando criar o hub:** mais de uns 4 sistemas com revendedor, vendedores reclamando dos vários logins, ou o fechamento mensal começando a tomar tempo.
**Como seria:** projeto separado com as tabelas de revendedores e comissões, e um conector fino em cada sistema (guarda o `ref`, avisa o hub e encaminha pagamentos), com fila de reenvio para o hub nunca derrubar o pagamento.

## 12. Fora do escopo agora

- Hub central de revendedores
- Outros gateways além do Asaas (a interface fica pronta para receber)
- Auto-cadastro de vendedores (só a base fica pronta: status `pending` e flag desligada)
- Pagamento automático de comissão (o split do Asaas pode permitir isso no futuro, conferindo as regras deles)
- White-label por revendedor (domínio e marca própria)

## 13. Para você confirmar

- [x] Com o módulo desligado, o vendedor que já vendeu continua **acessando o painel** para ver clientes e comissões (só o "Meu link" e as novas vendas ficam bloqueados)
- [x] As faixas por nº da venda entram como **um campo opcional** no formulário da regra
- [x] O vendedor entra pelo **mesmo login** do sistema e cai na área `/vendedor`, e só você cadastra vendedores (por convite)
- [x] Ordem de entrega: schema → link de afiliado → adaptador Asaas → painel do super_admin → painel do vendedor → exportar CSV

## 14. Regras de trabalho

Valem para toda esta feature:

- Nunca commitar na branch principal.
- Um commit por fase (ou menor), no padrão de mensagens do histórico.
- Antes de cada commit: lint, typecheck e testes (inclusive test:rls).
- Nunca `git add -A` às cegas. Nunca commitar .env, chaves, node_modules, test-results.
- Não fazer push, merge, rebase, reset --hard, force push nem apagar branches.
- Migrations só no Supabase local. Nunca rodar db push nem comandos no banco remoto. Se precisar parar a stack local do saas_posts para subir a deste repo, pode, mas avise no resumo.
- Não alterar o código de Stripe existente além do necessário: o Asaas entra como adaptador novo.
- Código do módulo isolado em uma pasta única.
- Dúvida de produto: seguir o que o plano diz e listar a suposição no resumo.

## 15. Asaas: referência confirmada na documentação oficial

Consultada em 30/10/2026.

**Autenticação:** com `authToken` configurado no webhook, o valor chega no header `asaas-access-token`. O token deve ter entre 32 e 255 caracteres e não pode ser uma API Key. ([Receba eventos](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook))

**Entrega:** "at least once", então o mesmo evento pode repetir. Responder 200 rápido; depois de 15 falhas consecutivas a fila é pausada, e eventos com mais de 14 dias são apagados. ([Idempotência](https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks), [Fila pausada](https://docs.asaas.com/docs/fila-pausada))

**Formato:** topo com `id`, `event`, `dateCreated` e `account`, mais o objeto `payment` ou `subscription`. Campos novos podem surgir e devem ser ignorados. ([Eventos para cobranças](https://docs.asaas.com/docs/webhook-para-cobrancas), [Eventos para assinaturas](https://docs.asaas.com/docs/eventos-para-assinaturas))

**Valores:** `value` é o valor da cobrança (bruto, o que usamos); `netValue` é o líquido após a tarifa. ([Recuperar cobrança](https://docs.asaas.com/reference/recuperar-uma-unica-cobranca))

| Evento do Asaas | Significado na documentação | Evento padrão |
|---|---|---|
| `PAYMENT_CONFIRMED` | Pago, saldo ainda não disponível | `subscription.activated` + pagamento |
| `PAYMENT_RECEIVED` | Recebido, saldo disponível | `subscription.activated` + pagamento |
| `PAYMENT_REFUNDED` | Estornado integralmente | `payment.refunded` |
| `PAYMENT_PARTIALLY_REFUNDED` | Estornado parcialmente | `payment.refunded`, com a soma de `GET /payments/{id}/refunds` em status `DONE` ([Listar estornos](https://docs.asaas.com/reference/listar-estornos-de-uma-cobranca)) |
| `PAYMENT_OVERDUE` | Vencida | `payment.failed` |
| `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED` | Removida, inativada | `subscription.canceled` |

Chargeback não tem evento próprio aqui: pela documentação, a perda termina em `PAYMENT_REFUNDED`.

No cartão, `PAYMENT_RECEIVED` chega cerca de 32 dias depois de `PAYMENT_CONFIRMED`. O lançamento nasce no primeiro dos dois, e o par `gateway + external_payment_id` impede a duplicata.
