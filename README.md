# Starter Kit SaaS Multi-Tenant

Base de produção para lançar novos SaaS trocando apenas **nome, cores, entidades de domínio, planos e gateway de pagamento**. Vem com autenticação completa, multiempresa com RLS testada, billing desacoplado, convites, auditoria, feature flags e UI responsiva.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS 4 + shadcn/ui · Supabase (Auth/Postgres) · Zod · Vitest · Playwright · GitHub Actions

## Como rodar

Requisitos: Node 22+, Docker (para o Supabase local).

```bash
npm install
npx supabase start          # sobe Postgres local e aplica as migrations
cp .env.example .env.local  # preencha com as chaves impressas pelo comando acima
npm run dev                 # http://localhost:3000
```

Crie uma conta em `/signup` — o onboarding cria sua primeira empresa e você vira `owner`.

### Variáveis de ambiente

| Variável | Onde roda | Descrição |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | chave anônima (RLS ativa) |
| `NEXT_PUBLIC_BACKEND_PROVIDER` | client | `supabase` (default) ou `api` |
| `SUPABASE_SERVICE_ROLE_KEY` | server | **nunca** exposta ao client (`server-only` garante) |
| `PAYMENT_GATEWAY` | server | `fake` (default, dev) ou `stripe` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | server | exigidas só com `PAYMENT_GATEWAY=stripe` |
| `EMAIL_PROVIDER` | server | `console` (default, dev) ou `resend` |
| `RESEND_API_KEY` / `EMAIL_FROM` | server | exigidas só com `EMAIL_PROVIDER=resend` |
| `APP_URL` | server | URL pública, usada em links de email |

Todas validadas com Zod em [src/config/env.ts](src/config/env.ts) — configuração faltando falha no boot, não no meio de uma request.

## Testes

```bash
npm run test       # unitários (Vitest) — regras de services
npm run test:rls   # isolamento multi-tenant em SQL, contra o Supabase local
npm run test:e2e   # Playwright: login→dashboard, convidar membro, trocar empresa
npm run lint && npm run typecheck
```

O CI (GitHub Actions) roda lint, typecheck, unitários, build e os testes de RLS num Supabase efêmero a cada PR.

## Como transformar em um produto

1. **Identidade** — nome/tagline em [src/config/brand.ts](src/config/brand.ts); cor primária e tokens em [src/app/globals.css](src/app/globals.css) (procure `--primary`).
2. **Entidades de domínio** — crie migrations em `supabase/migrations` (toda tabela de negócio com `company_id` + `deleted_at` + policies de RLS na mesma migration), types em `src/types`, repository em `src/repositories/supabase`, service em `src/services`, UI em `src/features/<dominio>`.
3. **Planos** — edite a migration de seed (`20260704120800_seed_plans.sql`) com os limites do seu produto; a checagem em runtime é sempre `billingService.canAccessFeature(companyId, featureKey)`.
4. **Gateway de pagamento** — implemente a interface [PaymentGateway](src/adapters/payment/PaymentGateway.ts) para seu provedor (Stripe via REST já incluso; `fake` simula o ciclo em dev) e registre na factory `src/adapters/payment/index.ts`. Webhooks são normalizados para eventos internos antes de tocar a lógica de negócio.
5. **Email** — mesma ideia: [EmailProvider](src/adapters/email/EmailProvider.ts) (Resend incluso, `console` para dev).
6. **Navegação** — adicione módulos em [src/components/app-shell/nav-items.ts](src/components/app-shell/nav-items.ts) com os papéis que podem vê-los.

## Arquitetura

```
componentes → hooks → services → repositories/adapters → Supabase | API externa | Gateway
```

Regras que o template já cumpre e que você deve manter:

- Componente React **nunca** importa `@supabase/supabase-js`; todo acesso passa por services/repositories.
- `service_role` só existe em `src/server` (o pacote `server-only` quebra o build se o client importar).
- Autorização real no backend: RLS em toda tabela + papel revalidado no service em operação sensível. UI só esconde botão.
- Zod no client **e** no server (server actions revalidam tudo).
- Rate limit em login, recuperação de senha e convite ([src/server/rateLimit.ts](src/server/rateLimit.ts) — troque o store in-memory ao escalar horizontalmente).
- Erros para o usuário via `toPublicError` ([src/lib/errors](src/lib/errors/index.ts)): nunca stack trace; detalhe fica no log do servidor.
- Logs jamais contêm senha, token ou payload de pagamento (auditoria sanitiza metadata automaticamente).
- Schema só muda por migration versionada — nunca pelo painel do Supabase.
- Tabela ou função nova nasce fechada para o client: declare o `GRANT` mínimo na mesma migration e inclua na matriz de [supabase/tests/rls_test.sql](supabase/tests/rls_test.sql).

## Estrutura

```
src/
  app/            # rotas: LP, (auth), onboarding, dashboard, api/webhooks
  components/     # UI genérica (shadcn/ui + app-shell)
  features/       # módulos por domínio (auth, companies, billing)
  services/       # regras de negócio (auth, tenant, billing, invite, audit...)
  repositories/   # implementações Supabase (client injetado)
  adapters/       # payment/ e email/ atrás de interfaces
  providers/      # theme e tenant (empresa ativa)
  server/         # server actions, clients supabase, rate limit (server-only)
  proxy.ts        # proteção de rotas (o "middleware" do Next 16)
supabase/
  migrations/     # schema + RLS + seeds, tudo versionado
  tests/          # testes SQL de isolamento multi-tenant
e2e/              # Playwright (fluxos críticos)
```

## Papéis

| Papel | Pode |
| --- | --- |
| `owner` | tudo, incluindo billing; não pode ser removido nem sair da empresa |
| `admin` | membros, convites, configurações e auditoria |
| `member` | acesso operacional; gerencia apenas o próprio perfil |
