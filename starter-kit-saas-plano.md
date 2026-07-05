# Starter Kit SaaS Multi-Tenant — Plano de Produção

## Objetivo

Base reutilizável para lançar novos SaaS rapidamente, mudando apenas: nome do produto, identidade visual, entidades de domínio, planos comerciais e gateway de pagamento. Tudo que não serve diretamente a esse objetivo foi removido. Tudo que é necessário para rodar em produção com segurança foi mantido ou adicionado.

---

## 1. Stack

- **Next.js (App Router) + TypeScript + React**
- **Tailwind CSS + Shadcn UI**
- **Supabase**: Auth, Postgres, Storage (trocável via adaptador, não via reescrita)
- **Zod** para validação (schemas compartilhados client/server)
- **Resend** (ou equivalente) para email transacional, atrás de adaptador
- **Vitest** (unitários/services) + **Playwright** (fluxos críticos: login, troca de empresa, convite)
- **GitHub Actions** para CI

---

## 2. Princípio arquitetural (não negociável)

Nenhum componente React chama Supabase diretamente. Fluxo único:

```
componentes → hooks → services → repositories/adapters → Supabase | API externa | Gateway de pagamento
```

- `NEXT_PUBLIC_BACKEND_PROVIDER=supabase | api` define qual adapter é usado.
- `service_role` do Supabase **nunca** roda no client — só em rotas server/edge functions.
- Autorização real vive no backend (RLS + checagem em service). O frontend só reflete a UI; nunca é a fonte de verdade sobre permissão.

---

## 3. Estrutura de pastas

```
src/
  app/                  # rotas (App Router)
  components/           # UI genérica (botões, tabelas, cards)
  features/             # módulos de domínio (auth, companies, billing...)
  services/             # authService, tenantService, billingService...
  repositories/         # implementação concreta (supabase, rest)
  adapters/             # paymentGateway, emailProvider, storageProvider
  providers/            # contexts (auth, tenant, theme)
  hooks/
  types/
  config/
  lib/                  # utils puros
  middleware.ts
  server/               # server actions / route handlers sensíveis
```

---

## 4. Autenticação e onboarding

- Signup, login, logout, recuperação de senha
- **Fluxo de criação da primeira empresa** (faltava no plano original — é o caminho mais crítico: signup → cria empresa → vira owner)
- Sessão persistente, middleware de proteção de rotas
- Redirect automático conforme estado de auth
- Tratamento de sessão expirada
- Bloqueio de acesso quando não há empresa ativa selecionada

---

## 5. Multi-tenant

- Usuário pode pertencer a N empresas; empresa ativa fica no contexto/sessão
- Toda query passa por `company_id`
- Papéis: `owner`, `admin`, `member` (estrutura pronta para permissões granulares depois)
- Owner convida membros (convite por email, expira, pode ser revogado)
- **Unicidade e integridade por tenant**: constraints como `UNIQUE(company_id, slug)`, nunca unicidade global onde não fizer sentido
- **Soft delete** (`deleted_at`) em vez de exclusão física nas tabelas de negócio

---

## 6. Segurança (produção)

- RLS ativo em toda tabela com `company_id`, políticas testadas (não só escritas)
- **Testes automatizados de RLS** (pgTAP ou scripts SQL) — é onde vazamento entre empresas normalmente nasce
- Validação com Zod no client e no server (nunca confiar só no client)
- Proteção contra acesso direto por ID de outro tenant (checagem explícita, não só RLS)
- Variáveis de ambiente separadas por ambiente (local/staging/prod), `service_role` fora do client
- Erros tratados sem vazar stack trace ao usuário
- Logs sem dados sensíveis (sem senha, token, payload de pagamento cru)
- Rate limit em rotas sensíveis (login, convite, recuperação de senha)
- **Migrations versionadas** no repositório (Supabase CLI) — nunca editar schema direto no painel

---

## 7. Camada de serviços e adaptadores

Services obrigatórios: `authService`, `tenantService`, `userService`, `billingService`, `auditService`, `permissionService`, `emailService`.

### Gateway de pagamento (trocável)

Interface única, ex.:

```ts
interface PaymentGateway {
  createCheckout(params): Promise<CheckoutSession>
  cancelSubscription(id): Promise<void>
  getPortalUrl(customerId): Promise<string>
  handleWebhook(payload, signature): Promise<NormalizedEvent>
}
```

Regras para troca fácil de gateway:
- Cada provedor (Stripe, Mercado Pago, Asaas...) implementa a interface em `adapters/payment/`
- Webhooks de qualquer provedor são **normalizados** para eventos internos (`subscription.activated`, `payment.failed`) antes de tocar a lógica de negócio
- Tabelas `plans`/`subscriptions` são neutras: colunas `gateway` e `gateway_subscription_id`, nunca `stripe_price_id` direto no schema principal

---

## 8. Banco de dados (schema inicial)

```
profiles
companies
company_members
company_invites
roles
audit_logs
plans
subscriptions
settings
```

Toda tabela de negócio nasce com `company_id` + `deleted_at`.

---

## 9. Billing / planos

- Planos: free, pro, enterprise
- Tabela de planos + assinatura + status + limites por plano
- Função central `canAccessFeature(companyId, featureKey)` — único ponto de checagem de limite, usado em toda a app
- Sem integração real de pagamento no MVP, mas interface `PaymentGateway` já implementada com um provedor (ex. Stripe) para validar a abstração

---

## 10. Auditoria e feature flags

- `audit_logs`: usuário, empresa, ação, entidade, dados antes/depois, timestamp — estrutura básica, sem UI avançada no MVP
- Feature flags simples por plano/empresa/usuário (tabela + função de checagem, sem painel complexo)

---

## 11. Layout e Design System (PC + Mobile)

Requisito central: **sidebar funcional nos dois formatos**, sem duas implementações separadas.

**Desktop (≥1024px):**
- Sidebar fixa à esquerda, colapsável para modo "rail" (só ícones) via botão persistente (estado salvo em cookie/localStorage)
- Header com breadcrumbs, seletor de empresa ativa e menu do usuário
- Conteúdo principal com largura máxima controlada, cards de métrica em grid responsivo

**Mobile (<1024px):**
- Sidebar vira **drawer** (off-canvas), acionado por botão hambúrguer no header
- Header fixo no topo com título da página + seletor de empresa ativa (dropdown compacto)
- Considerar navegação inferior (bottom nav) só para 3–4 ações mais usadas, se o produto final precisar — no starter, drawer já resolve
- Tabelas: em telas pequenas, colapsar para cards empilhados em vez de scroll horizontal forçado

**Componentes compartilhados (Shadcn) usados nos dois breakpoints:**
- Sidebar com componente único que muda de comportamento via CSS/estado, não via componentes duplicados
- Tabelas reutilizáveis com modo "cards" abaixo do breakpoint definido
- Modais viram bottom-sheet em mobile quando o conteúdo for longo
- Toasts, skeleton loading e empty states padronizados, usados em toda tela

**Tema:**
- Dark/light via CSS variables + Shadcn theme provider
- Cor primária configurável em um único arquivo de tokens (facilita trocar identidade visual entre projetos)

---

## 12. Testes e CI

- Vitest para services e regras de negócio (ex.: `canAccessFeature`, cálculo de limites)
- Playwright para 3 fluxos críticos: login → dashboard, criar empresa → convidar membro, trocar empresa ativa
- Testes de RLS via SQL/pgTAP
- GitHub Actions: lint + typecheck + testes em cada PR antes de mergear

---

## 13. Boas práticas

- Services sem lógica visual; hooks para regras de tela; componentes pequenos
- Types centralizados em `src/types`
- Tratamento de erro padronizado (um formato de erro em toda a app)
- Evitar overengineering: features de baixa prioridade ficam como interface pronta, não como implementação completa
- README explicando como clonar o starter e trocar: nome, cores, entidades de domínio, gateway de pagamento

---

## 14. Ordem de implementação

**Fase 1 — essencial:**
Auth completo (incl. signup/onboarding) → Multiempresa → RLS + testes de RLS → Middleware de proteção → Layout responsivo com sidebar → API client desacoplado → Gestão de empresas/membros → Zod → Migrations versionadas → README

**Fase 2 — estrutura pronta, sem aprofundar:**
Billing (com 1 gateway implementado via interface) → Auditoria básica → Convites → Feature flags → Email service → CI básico

**Fase 3 — deixar de fora do primeiro MVP:**
Pagamento com múltiplos gateways simultâneos, webhooks complexos, analytics avançado, i18n completo, permissões granulares estilo enterprise, app mobile nativo

---

## Checklist antes de considerar "pronto para produção"

- [ ] RLS testado, não só escrito
- [ ] `service_role` nunca chega ao client
- [ ] Migrations no repositório, schema nunca editado manualmente
- [ ] Zod validando no server, não só no client
- [ ] Rate limit em login/recuperação/convite
- [ ] Erros não vazam stack trace
- [ ] Sidebar testada em mobile real (não só resize de browser)
- [ ] Gateway de pagamento isolado atrás de interface, sem `stripe_*` vazando no schema principal
