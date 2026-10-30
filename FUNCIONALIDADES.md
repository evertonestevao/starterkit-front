# Funcionalidades do sistema

O que o starter kit faz, quem pode usar cada função e quais regras se aplicam. Para setup,
arquitetura e deploy, veja [DOCUMENTACAO.md](DOCUMENTACAO.md).

> **Mantenha este arquivo atualizado.** Toda mudança que cria, altera ou remove uma
> funcionalidade atualiza a seção correspondente no mesmo commit.

**Última atualização:** 2026-10-30

## Sumário

1. [Papéis e permissões](#1-papéis-e-permissões)
2. [Conta e autenticação](#2-conta-e-autenticação)
3. [Termos de uso e consentimentos](#3-termos-de-uso-e-consentimentos)
4. [Empresas (multi-tenant)](#4-empresas-multi-tenant)
5. [Membros e convites](#5-membros-e-convites)
6. [Perfil do usuário](#6-perfil-do-usuário)
7. [Seus dados: exportação e exclusão de conta](#7-seus-dados-exportação-e-exclusão-de-conta)
8. [Planos, assinatura e billing](#8-planos-assinatura-e-billing)
9. [Feature flags](#9-feature-flags)
10. [Auditoria](#10-auditoria)
11. [Dashboard e navegação](#11-dashboard-e-navegação)
12. [Páginas públicas](#12-páginas-públicas)
13. [Operação: health check, erros e rate limit](#13-operação-health-check-erros-e-rate-limit)
14. [Integrações e provedores trocáveis](#14-integrações-e-provedores-trocáveis)
15. [Revendedores (em construção)](#15-revendedores-em-construção)

---

## 1. Papéis e permissões

Cada usuário tem um papel **por empresa**: a mesma pessoa pode ser owner de uma empresa e
member de outra.

| Capacidade | Owner | Admin | Member |
|---|:-:|:-:|:-:|
| Ver dados da empresa e lista de membros | ✅ | ✅ | ✅ |
| Editar nome da empresa | ✅ | ✅ | — |
| Convidar, revogar convite, mudar papel, remover membro | ✅ | ✅¹ | — |
| Ver auditoria | ✅ | ✅ | — |
| Assinar, trocar e cancelar plano | ✅ | — | — |
| Transferir a propriedade da empresa | ✅ | — | — |
| Sair da empresa | — ² | ✅ | ✅ |

¹ Ações sobre outro membro exigem papel **acima** do papel do alvo: um admin gerencia members,
mas não outros admins nem o owner.
² O owner precisa transferir a empresa antes de sair.

- Toda regra é checada no servidor (services) **e** no banco (RLS). Esconder um botão na tela é
  só conveniência.
- Novos papéis são criados por migration (`public.roles`) mais `defineRole()` em
  `src/services/permissionService.ts`.
- **Super admin** é um papel global da plataforma, separado dos papéis por empresa: fica em
  `public.platform_admins`, que a aplicação só lê. A concessão é feita direto no banco, com
  `insert into public.platform_admins (user_id) select id from auth.users where email = '...';`.

## 2. Conta e autenticação

| Função | Como funciona | Regras |
|---|---|---|
| **Cadastro** (`/signup`) | Nome completo, email e senha. Mostra links para Termos e Privacidade. | Senha com no mínimo 8 caracteres. Rate limit por email. |
| **Login** (`/login`) | Email e senha. Respeita `?next=` para voltar à página de origem. | 10 tentativas por minuto por email. |
| **Logout** | Menu do usuário, no topo do painel. | — |
| **Esqueci a senha** (`/forgot-password`) | Envia um link de redefinição por email. | Sempre responde "se o email existir…", para não revelar quais emails têm conta. Rate limit por email. |
| **Redefinir senha** (`/reset-password`) | Abre pelo link do email (fluxo PKCE via `/auth/confirm`). | Só aceita redirects para domínios permitidos. |

Rotas do painel exigem login. Usuário logado que abre `/login` ou `/signup` é redirecionado.

Código: `src/services/authService.ts`, `src/server/actions/auth.ts`, `src/proxy.ts`.

## 3. Termos de uso e consentimentos

| Função | Como funciona |
|---|---|
| **Termos versionados** | Cada versão fica em `terms_versions`; só uma é a vigente. A página pública `/terms` mostra a vigente. |
| **Aceite no onboarding** | A primeira empresa só é criada depois do aceite da versão vigente. |
| **Reaceite obrigatório** | Ao publicar uma versão nova, todo usuário é levado a `/accept-terms` antes de continuar. |
| **Evidência do aceite** | Grava data, IP e navegador de cada aceite (LGPD). |
| **Consentimento por finalidade** | Hoje existe a finalidade `email_communications` (opcional, revogável). Cada mudança gera um registro novo, com histórico. |

Publicar termos novos: migration em produção, ou `scripts/publish-terms.sh` em desenvolvimento.

Código: `src/services/termsService.ts`, `src/server/actions/terms.ts`.

## 4. Empresas (multi-tenant)

| Função | Quem | Como funciona |
|---|---|---|
| **Criar empresa** (`/onboarding`) | Qualquer usuário logado | Quem cria vira owner. O slug é gerado a partir do nome (com sufixo se já existir). |
| **Várias empresas por usuário** | Todos | O seletor no topo do painel troca a **empresa ativa**. |
| **Empresa ativa** | Todos | Guardada em cookie só como preferência. A cada request o servidor confere se o usuário ainda é membro. |
| **Editar nome** (Configurações) | Owner, admin | — |
| **Transferir propriedade** (Membros › ⋯) | Owner | Escolhe um membro ativo, que vira owner. O owner antigo vira admin. A troca é atômica e auditada. |
| **Sair da empresa** (Configurações) | Admin, member | — |

Isolamento: toda tabela de negócio tem `company_id`, RLS e soft delete (`deleted_at`). Um usuário
nunca vê nem altera dados de uma empresa da qual não é membro, o que é provado por
`supabase/tests/rls_test.sql`.

Código: `src/services/tenantService.ts`, `src/server/actions/tenant.ts`, `src/server/tenant.ts`.

## 5. Membros e convites

| Função | Quem | Regras |
|---|---|---|
| **Listar membros** (`/dashboard/members`) | Owner, admin | Paginado (20 por página). Vira tabela no desktop e cards no mobile. |
| **Convidar por email** | Owner, admin | Papel admin ou member. O convite expira em 7 dias. Limite de 20 convites por hora por pessoa. |
| **Revogar convite pendente** | Owner, admin | — |
| **Aceitar convite** (`/invites/accept`) | O convidado | Pelo link do email ou em Configurações › "Convites pendentes para você". O menu mostra um badge com a contagem. |
| **Mudar papel** (admin ↔ member) | Owner, admin | Hierarquia: só sobre papéis abaixo do seu. |
| **Remover membro** | Owner, admin | Soft delete. O owner nunca pode ser removido. |

Cada convite pendente reserva uma vaga (seat). Passar da franquia do plano não bloqueia o convite:
a cobrança de usuários extras é recalculada (ver seção 8).

Código: `src/services/inviteService.ts`, `src/services/tenantService.ts`.

## 6. Perfil do usuário

| Função | Regras |
|---|---|
| **Editar nome** (Configurações) | De 2 a 120 caracteres. |
| **Trocar avatar** | JPG, PNG ou WebP, até 2 MB. Validado no navegador e no servidor. Cada usuário só grava na própria pasta do storage. |

Código: `src/services/userService.ts`, `src/server/actions/user.ts`.

## 7. Seus dados: exportação e exclusão de conta

Direitos do titular previstos na LGPD (art. 18). Ficam em **Configurações › Seus dados**.

| Função | Como funciona |
|---|---|
| **Baixar meus dados** | Gera um JSON com conta, perfil, empresas e papéis, aceites de termos (com IP e navegador) e histórico de consentimentos. Rota `GET /api/account/export`. |
| **Excluir minha conta** | Pede o email do usuário como confirmação. A exclusão é definitiva. |

Regras da exclusão:

- **Bloqueada** se o usuário é owner de uma empresa com outros membros: precisa transferir a
  propriedade antes.
- **Bloqueada** se o usuário é o único membro de uma empresa com assinatura ativa, em teste ou em
  atraso: precisa cancelar antes.
- Empresas em que o usuário é o único membro são **encerradas** (soft delete) junto com a conta.
- Nas demais empresas fica um registro na auditoria (`member.account_deleted`).
- São apagados: avatar, usuário, perfil, memberships, aceites e consentimentos. Registros de
  auditoria permanecem, mas ficam sem o vínculo com a pessoa.
- Exportação e exclusão têm limite de 5 tentativas por hora por usuário.

Código: `src/services/accountService.ts`, `src/server/account.ts`, `src/server/actions/account.ts`.

## 8. Planos, assinatura e billing

| Plano | Preço/mês | Membros inclusos | Membro extra | Auditoria | API | Relatórios |
|---|---|---|---|---|:-:|:-:|
| Free | R$ 0 | 3 | — | 7 dias | — | — |
| Pro | R$ 99 | 15 | R$ 19,90 | 90 dias | ✅ | ✅ |
| Enterprise | R$ 499 | 999 | R$ 39,90 | 365 dias | ✅ | ✅ |

Os valores vêm das migrations `seed_plans` e `plans_extra_seat_price`. A landing
(`src/features/marketing/content.ts`) espelha esses dados: mudou em um lugar, mude no outro.

| Função | Quem | Como funciona |
|---|---|---|
| **Ver plano e uso de seats** (`/dashboard/billing`) | Owner | — |
| **Assinar / trocar plano** | Owner | Página de pagamento hospedada pelo gateway. No Asaas, o cliente escolhe PIX, boleto ou cartão. Com `PAYMENT_GATEWAY=fake`, ativa o plano direto, para desenvolvimento. |
| **Cancelar assinatura** | Owner | Cancela no gateway. O acesso segue até o fim do período pago. |
| **Cobrança por seat** | Automático | Ao convidar, revogar ou remover membros, os extras são sincronizados com o gateway: item com quantidade (Stripe) ou novo valor total da assinatura (Asaas). |
| **Webhook de pagamento** (`POST /api/webhooks/payment`) | Gateway | Autenticidade verificada por cada provedor (HMAC no Stripe, token no Asaas). Os eventos atualizam `subscriptions` de forma idempotente e entram na auditoria. Em uma reassinatura, a assinatura anterior da empresa vai para o histórico e a nova assume. |
| **Limites por plano** | Código | `canAccessFeature()` e `getFeatureLimit()` são o ponto único de checagem. |

**Gateways disponíveis** (`PAYMENT_GATEWAY`):

| Gateway | Como cobra | Formas de pagamento | Portal do cliente |
|---|---|---|---|
| `asaas` | Pelo valor do plano no banco | PIX, boleto, cartão | Não |
| `stripe` | Pelo catálogo de preços (`PAYMENT_PRICE_*`) | Cartão | Sim |
| `fake` | Simulação local | — | Não |

Para adicionar outro provedor, basta um arquivo em `src/adapters/payment/` (passo a passo no
topo de `PaymentGateway.ts`).

Código: `src/services/billingService.ts`, `src/server/actions/billing.ts`, `src/adapters/payment/`.

## 9. Feature flags

Ainda sem tela: a configuração é feita por código ou banco.

- O valor padrão vem das features do plano da empresa.
- Overrides ficam em `settings`:
  - `feature:<chave>` vale para a empresa inteira;
  - `feature:<chave>:user:<userId>` vale para um usuário.
- Precedência: **usuário > empresa > plano**. Override que não seja booleano é ignorado.

Código: `src/services/featureFlagService.ts`.

## 10. Auditoria

| Função | Quem | Como funciona |
|---|---|---|
| **Trilha de auditoria** (`/dashboard/audit`) | Owner, admin | Lista paginada (20 por página) das ações na empresa: quem, o quê, quando. |
| **Registro automático** | Sistema | Edição da empresa, mudança de papel, remoção, saída, convites, transferência de propriedade, exclusão de conta, eventos de pagamento. |
| **Imutável** | — | O client não edita nem apaga registros. |
| **Dados sensíveis** | — | Chaves como senha, token, secret e card são removidas antes de gravar. |

Se a gravação da auditoria falhar, a action retorna erro. Uma trilha furada é tratada como pior
que uma operação recusada.

Código: `src/services/auditService.ts`, `src/server/audit.ts`.

## 11. Dashboard e navegação

- **Dashboard** (`/dashboard`): cards de membros ativos, convites pendentes, plano e seu papel,
  além de gráficos de exemplo (linha, barras e donut) para servir de modelo.
- **Menu lateral único:** vira drawer abaixo de 1024 px e colapsa em ícones ("rail") no desktop.
  Os itens aparecem conforme o papel:

  | Item | Quem vê |
  |---|---|
  | Dashboard, Configurações | Todos |
  | Membros, Auditoria | Owner, admin |
  | Billing | Owner |

- **Tema** claro e escuro, com cor primária em `src/app/globals.css`.
- **Acessibilidade:** link "Pular para o conteúdo" (primeiro Tab), rótulos em pt-BR para leitores
  de tela, descrição textual nos gráficos.

## 12. Páginas públicas

| Página | Conteúdo |
|---|---|
| `/` | Landing page. O texto fica em `src/features/marketing/content.ts`. |
| `/terms` | Termos de Uso vigentes (versionados no banco). |
| `/privacy` | Política de Privacidade: controlador, dados, bases legais, suboperadores, cookies, direitos. |
| `/refund` | Política de Reembolso: arrependimento em 7 dias (CDC), cancelamento, como pedir. |

O rodapé mostra os dados legais da empresa (`brand.legal` em `src/config/brand.ts`): razão social,
CNPJ, endereço, email de suporte e do encarregado de dados.

> Os textos de `/terms`, `/privacy` e `/refund` são **esqueletos sem valor jurídico**. Precisam de
> revisão profissional antes do uso com clientes reais.

## 13. Operação: health check, erros e rate limit

| Função | Como funciona |
|---|---|
| **Health check** (`GET /api/health`) | Retorna 200 `{"status":"ok"}` ou 503 com o item que falhou. Checa o banco com timeout de 3 s e não expõe detalhes internos. |
| **Monitoramento de erros** | `ERROR_REPORTER=console` (padrão, só log no servidor) ou `sentry` (exige `SENTRY_DSN`). Captura erros de actions, rotas de API e os que o Next pega sozinho. Remove dados sensíveis antes do envio. |
| **Formato único de erro** | O usuário vê só uma mensagem segura. Stack trace e detalhes ficam no servidor (`src/lib/errors`). |
| **Rate limit** | Login, cadastro e recuperação de senha (por email), convites (20/hora) e exportação/exclusão de conta (5/hora). Store `memory` (dev) ou `redis` (Upstash, produção). |

## 14. Integrações e provedores trocáveis

Toda integração externa fica atrás de uma interface em `src/adapters/`. Trocar de provedor
significa escrever um adapter novo, sem mexer em regra de negócio.

| Interface | Implementações | Variável |
|---|---|---|
| `PaymentGateway` | Asaas, Stripe, fake | `PAYMENT_GATEWAY` |
| `EmailProvider` | Resend, console | `EMAIL_PROVIDER` |
| `StorageProvider` | Supabase Storage | — |
| `NotificationProvider` | console | `NOTIFICATION_PROVIDER` |
| `ErrorReporter` | Sentry, console | `ERROR_REPORTER` |
| Rate limiter | memória, Upstash Redis | `RATE_LIMIT_STORE` |

Os emails de autenticação (confirmação e recuperação de senha) saem pelo Supabase Auth. O
`EmailProvider` cobre os emails transacionais do app, como convites.

## 15. Revendedores (em construção)

Só a base de dados existe; ainda não há telas, link de afiliado nem integração com o webhook.
O módulo nasce **desligado** e, por enquanto, nenhum vendedor é vinculado pela aplicação.

| Quem | O que pode, no banco |
|---|---|
| Super admin | Administra vendedores, regras, vínculos e lançamentos; toda mudança fica em `reseller_audit_log` |
| Vendedor ativo | Lê só os próprios dados, pelas views `reseller_me`, `reseller_my_clients`, `reseller_my_commissions` e `reseller_available_plans` |
| Backend | Vincula clientes e gera ou estorna lançamentos, pelas funções restritas ao `service_role` |

Regras já aplicadas: faixas por nº da venda, duração em meses cobertos, ajuste por cliente válido
só para os próximos lançamentos, um lançamento por pagamento e estorno que reverte o pendente e só
sinaliza o já pago. Pagamento que cobre mais meses que a duração restante gera comissão
proporcional. Cliente que volta reabre o vínculo dentro de `client_return_window_days` (padrão: 90
dias, em `reseller_settings`). Plano completo em `docs/plano-modulo-revendedores.md`.
