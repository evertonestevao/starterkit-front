# Auditoria do módulo de revendedores

Confronto de `docs/plano-modulo-revendedores.md`, seções 3 a 10, com o código e os testes. Caminhos curtos: `m/` é `src/modules/resellers/`, e `mig/` é `supabase/migrations/`. `resellers_test.sql` está em `supabase/tests/`.

**Status:** feito, parcial ou não feito. Item feito de outra forma que o plano traz a diferença na coluna de evidência.

## Seção 3: regras de comissão

| Item | Evidência | Status |
|---|---|---|
| Tipo percentual ou valor fixo | `mig/20261030120000_resellers.sql`; `m/schemas.test.ts` | Feito |
| Por vendedor, por plano e padrão global | `resolve_commission`; `resellers_test.sql` ("Qual regra vale") | Feito |
| Por produto | Sem catálogo de produtos no repo, decisão aprovada em 30/10/2026. Cada deploy é um sistema, e o plano registra a diferença na seção 10 | Feito (sem produto) |
| Faixas por nº da venda, campo opcional | `m/admin/rules-page.tsx`; `resellers_test.sql` ("faixas", "Nº da venda") | Feito |
| Duração vazia ou em meses, por regra e por cliente | `register_commission`; `resellers_test.sql` ("duração", "proporcional") | Feito |
| Ajuste por cliente, com `is_override` | `updateClientCommissionAction`; `e2e/reseller-admin.spec.ts` | Feito |
| Regra mais específica vence | `resellers_test.sql` ("Qual regra vale") | Feito |
| Nº da venda conta só cliente com pagamento | `mig/20261030190000_reseller_sale_number_on_payment.sql`; `resellers_test.sql` ("Nº da venda": 3 abandonados + 1 pago = venda 1; 4ª paga = 40%) | Feito |

## Seção 4: visibilidade de planos

| Item | Evidência | Status |
|---|---|---|
| `available_to_resellers`, desligada por padrão | `mig/20261030120000_resellers.sql`; `resellers_test.sql` | Feito |
| Coluna fechada para anon | `mig/20261030130000_resellers_adjustments.sql`; `rls_test.sql` (matriz por coluna) | Feito |
| Vendedor só vê e vende os liberados | `reseller_available_plans`; `link_company_to_reseller`; `e2e/commission.spec.ts` | Feito |
| Esconder afeta só novas vendas | `resellers_test.sql` ("plano escondido") | Feito |

## Seção 5: link de afiliado

| Item | Evidência | Status |
|---|---|---|
| `/r/CODIGO` e `?ref=CODIGO` | `src/app/r/[code]/route.ts`; `src/proxy.ts`; `e2e/referral.spec.ts` | Feito |
| Cookie no servidor, 30 dias, URL limpa | `m/referralCookie.ts`; `m/referral.test.ts`; `e2e/referral.spec.ts` | Feito |
| Vale o primeiro vendedor | `m/referralService.ts`; `e2e/referral.spec.ts` | Feito |
| Auto-indicação bloqueada (usuário ou e-mail) | `is_self_referral`; `resellers_test.sql`; `e2e/referral.spec.ts` | Feito |
| Código inválido ou suspenso ignorado em silêncio | `e2e/referral.spec.ts` | Feito |
| Rate limit em `/r` | `m/referralService.ts`; `m/referral.test.ts`; `e2e/reseller-export.spec.ts` | Feito |
| "Meu link" com botão de copiar por plano | `m/seller/link-page.tsx`; `e2e/reseller-area.spec.ts` | Parcial: o link por plano leva `?plano=`, mas a página de venda ainda não pré-seleciona o plano |
| Código gravado no cadastro do cliente | `reseller_referrals`; `e2e/referral.spec.ts` | Feito |

## Seção 6: login do vendedor

| Item | Evidência | Status |
|---|---|---|
| Só o super admin cadastra, por convite | `createResellerAction`; `m/actions.test.ts`; `e2e/reseller-admin.spec.ts` | Feito |
| Código gerado e editável | `generateReferralCode`; `updateResellerAction` | Feito |
| E-mail de convite define a senha | `m/resellerInvite.ts`; `e2e/reseller-area.spec.ts` (link do convite) | Parcial: link testado de ponta a ponta, envio real por provedor de e-mail não testado |
| Mesmo login; vendedor cai em `/vendedor` | `resolvePostLoginPath`; `e2e/reseller-area.spec.ts` | Feito |
| Quem é vendedor vem só de `resellers` | `m/areaAccess.ts`; `resellers_test.sql` (revisão) | Feito |
| Mesmo e-mail cliente e vendedor escolhe a área | `/escolher-area`; `e2e/reseller-area.spec.ts` | Feito |
| Suspender bloqueia painel e vendas, preserva lançamentos | `resellers_test.sql`; `e2e/reseller-area.spec.ts`; `e2e/reseller-usability.spec.ts` | Feito |
| `pending` e `reseller_self_signup` preparados, sem tela | `mig/20261030120000_resellers.sql` | Feito |
| Vendedor lê só por views; não vê tenants nem outros | `m/sellerRepository.ts`; `e2e/reseller-area.spec.ts` (19 tabelas e views pela API) | Feito |
| Exportação LGPD com dados de revenda | `getResellerExportData`; `e2e/reseller-area.spec.ts` | Feito |
| Exclusão bloqueada com comissão pendente | `getResellerDeletionBlockers`; `accountService.test.ts`; `e2e/reseller-area.spec.ts` | Feito |

## Seção 7: gateway e pagamento

| Item | Evidência | Status |
|---|---|---|
| Adaptador com eventos padrão, sem criar outra abstração | `src/adapters/payment/asaasGateway.ts`; `asaasGateway.test.ts` | Feito |
| Rota `/api/webhooks/[gateway]` | `src/app/api/webhooks/[gateway]/route.ts`; `e2e/commission.spec.ts` | Feito |
| Par único `gateway + external_payment_id` | `reseller_commissions_payment_unique`; `e2e/commission.spec.ts` | Feito |
| Nomes de eventos confirmados, com links | Plano, seção 15 | Feito |
| Vínculo antes do primeiro pagamento | `link_company_at_checkout`; `e2e/commission.spec.ts` | Feito |
| Lançamento sobre o valor bruto | `asaasGateway.test.ts` (`value`, não `netValue`) | Feito |
| Estorno de pendente reverte; pago não muda | `e2e/commission.spec.ts`; `resellers_test.sql` | Feito |
| Falha de comissão não derruba o pagamento | `m/commission.test.ts`; `e2e/commission.spec.ts` | Feito |
| Venda sem regra pode ser vinculada depois | `link_company_from_alert`; `e2e/reseller-usability.spec.ts` | Feito |
| Ciclo real no Asaas | Só payloads da documentação e gateway fake. Exige as suas chaves do sandbox | Parcial |

## Seção 8: liga/desliga

| Item | Evidência | Status |
|---|---|---|
| Desligado ignora o link e não vincula | `e2e/referral.spec.ts`; `resellers_test.sql` | Feito |
| Desligado: quem vendeu continua gerando e vendo | `e2e/commission.spec.ts`; `e2e/reseller-area.spec.ts` | Feito |
| Só "Meu link" fica bloqueado | `e2e/reseller-area.spec.ts` | Feito |

## Seção 9: fechamento

| Item | Evidência | Status |
|---|---|---|
| CSV do mês com total por vendedor | `m/commissionCsv.ts`; `m/commissionCsv.test.ts`; `e2e/reseller-export.spec.ts` | Feito |
| CSV respeita os filtros da tela | `e2e/reseller-export.spec.ts` | Feito |
| Marcar como pago, com data e em lote | `markCommissionsPaidAction`; `e2e/reseller-usability.spec.ts` | Feito |

## Seção 10: entregáveis

| Item | Evidência | Status |
|---|---|---|
| 1. Schema adaptado | `mig/20261030120000_resellers.sql` e seguintes | Feito |
| 2. Link de afiliado | Seção 5 acima | Feito |
| 3. Adaptador e webhook | Seção 7 acima | Feito, sem ciclo real |
| 4. Painel do super admin, com filtros e lote | `m/admin/`; `e2e/reseller-admin.spec.ts` | Feito |
| Histórico de alterações visível | `reseller_audit_log`; página do vendedor mostra vínculos e lançamentos | Parcial: regras e planos ficam registrados, mas sem tela de consulta |
| Filtro por produto | Ver seção 3 | Feito (sem produto) |
| 5. Painel do vendedor | `m/seller/`; `e2e/reseller-area.spec.ts` | Feito |
| 6. Exportar CSV | Seção 9 acima | Feito |
| 7. Testes de regras, link e RLS | `resellers_test.sql`; `rls_test.sql`; `m/*.test.ts` | Feito |
| 8. Pendências (exclusão, LGPD, `LINK_NO_RULE`) | Seções 6 e 7 acima | Feito |

## Conferências pedidas

| Item | Resultado |
|---|---|
| `docs/operacao-revendedores.md` | Existe e cobre cadastrar vendedor, liberar plano, fechar o mês e reprocessar falha |
| Módulo isolado | Código em `src/modules/resellers`. Fora dele: rotas finas em `src/app`, migrations, testes e pontos de contato em `proxy.ts`, layout do dashboard, login, criação de empresa, checkout, webhook e conta |
| Campos de gateway neutros | Teste automático em `resellers_test.sql` recusa coluna com nome de gateway |
| Celular, 390 px | Prints conferidos; `e2e/reseller-area.spec.ts` recusa rolagem horizontal e elemento cortado |

## O que continua parcial

| Item | Por quê | O que resolve |
|---|---|---|
| Ciclo real no Asaas | Depende das suas chaves do sandbox | Roteiro em `.env.example` |
| Envio real do e-mail de convite | Depende do provedor de e-mail configurado | Cadastrar um vendedor com `EMAIL_PROVIDER=resend` |
| Pré-seleção do plano pelo link | A página de venda nova está na branch `feat/landing-page` | Ler `?plano=` depois de juntar as branches |
| Tela de histórico de regras e planos | Os dados estão em `reseller_audit_log`; falta só a consulta | Decisão sua: o plano pede o registro, não a tela |
