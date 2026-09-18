@AGENTS.md

# CLAUDE.md

Este arquivo orienta o Claude Code ao trabalhar neste repositório. Leia antes de propor qualquer mudança.

## Sobre o projeto

Starter kit SaaS multi-tenant (multiempresa), pensado para ser reutilizado como base de vários produtos futuros. Segurança e desacoplamento de backend são prioridades reais, não formalidade — trate como se estivesse indo para produção.

## Stack

- Next.js (App Router) + TypeScript + React
- Tailwind CSS + Shadcn UI
- Supabase (Auth, Postgres, Storage) — acessado só via camada de services/adapters
- Zod para toda validação
- Vitest (unitários) + Playwright (fluxos críticos)

## Regra arquitetural inegociável

Componentes React **nunca** chamam Supabase diretamente. Fluxo obrigatório:

```
componentes → hooks → services → repositories/adapters → Supabase | API externa
```

Se uma mudança exigir importar `@supabase/supabase-js` dentro de `src/components` ou `src/app`, pare e refatore para passar por `src/services` ou `src/repositories`. Não faça a exceção "só dessa vez".

`service_role` do Supabase nunca aparece em código que roda no client. Só em `src/server` ou route handlers.

## Estrutura de pastas

```
src/
  app/            # rotas (App Router)
  components/     # UI genérica, sem lógica de negócio
  features/       # módulos por domínio (auth, companies, billing...)
  services/       # authService, tenantService, billingService, emailService...
  repositories/   # implementação concreta (supabase, rest)
  adapters/       # paymentGateway, emailProvider, storageProvider
  providers/      # contexts (auth, tenant, theme)
  hooks/
  types/
  config/
  lib/            # utils puros, sem I/O
  middleware.ts
  server/         # server actions / route handlers sensíveis
```

Ao criar um arquivo novo, pergunte: "isso é lógica de negócio (service), estado de tela (hook) ou visual puro (component)?" e coloque na pasta certa. Não misture os três no mesmo arquivo.

## Multi-tenant

- Toda tabela de negócio tem `company_id` e `deleted_at` (soft delete)
- Toda query de dados de negócio deve filtrar por `company_id` da empresa ativa — nunca confie apenas em RLS, replique a checagem no service quando a operação for sensível
- Papéis: `owner`, `admin`, `member`
- Nunca escreva uma query que aceite um ID de recurso sem validar que ele pertence à empresa ativa do usuário

## Segurança — regras a seguir sempre

- Validação com Zod no client **e** no server; nunca confiar só na validação do formulário
- RLS deve existir em toda tabela nova com `company_id`; ao criar uma tabela, já escreva a policy junto, na mesma migration
- Migrations sempre versionadas em `supabase/migrations` — nunca oriente editar schema pelo painel do Supabase
- Erros retornados ao usuário nunca incluem stack trace ou detalhes internos; log detalhado fica só no servidor
- Nunca logar senha, token, payload de pagamento cru ou dados de cartão
- Rate limit obrigatório em: login, recuperação de senha, envio de convite
- Pagamento sempre atrás das interfaces de `src/adapters/payment` — `PaymentGateway` (assinatura SaaS da empresa, plano fixo) ou `RecurringBillingProvider` (patrocínio, valor variável). A escolha do provedor acontece SÓ em `src/adapters/payment/index.ts`; nunca chamar SDK/API de provedor (Stripe, Asaas...) direto de um service ou componente. O provedor de cada conta de patrocinador fica gravado nela, para que trocar o padrão não quebre assinaturas em andamento
- No Supabase, tabela nova em `public` nasce com ALL para `anon`/`authenticated` (default privileges da plataforma) e função nasce executável por todos. Segurança por coluna ou por operação exige `REVOKE ALL` antes dos `GRANT`s explícitos, na mesma migration — "não conceder" não basta
- Conteúdo que aparece em página pública de igreja (hoje: nome e logo do patrocinador) nunca é escrito direto pelo dono da conta. A coluna não tem GRANT de update; a alteração vira pedido em `sponsor_profile_changes` e só a moderação aplica. Ao criar um campo novo desse tipo, siga o mesmo caminho — uma conta invadida não pode publicar nada sozinha
- Moderação da plataforma (`platform_staff`) é um eixo separado dos papéis de empresa e atravessa o isolamento entre tenants por definição. Ela nunca ganha SELECT nas tabelas dos clientes: só `execute` em RPCs `security definer` estreitas, e toda decisão é registrada em `platform_staff_actions` (não em `audit_logs`, que exige `company_id`). Entrada só por `scripts/add-platform-staff.mjs`, com `service_role`
- Upload de arquivo: o tipo vem dos bytes (`src/lib/imageValidation.ts`), nunca do `Content-Type` ou da extensão, que são escolhidos por quem envia. SVG não entra em bucket público — é executável se aberto direto na origem. Arquivo esperando moderação fica em pasta separada, onde o client escreve; a pasta publicada só aceita `service_role`

## Padrões de código

- Services não têm lógica visual; hooks concentram regra de tela; componentes ficam pequenos e "burros"
- Types centralizados em `src/types`, não duplicar interface em vários arquivos
- Um formato único de erro tratado em toda a aplicação (definir em `src/lib/errors`)
- Nomes descritivos; evitar abreviações obscuras
- Evitar overengineering: se uma feature está em fase de "estrutura preparada" (billing, feature flags, auditoria), implemente a interface e o essencial, não construa a versão completa sem necessidade

## Layout e responsividade

- Sidebar é um único componente que muda de comportamento por breakpoint: vira drawer off-canvas abaixo de 1024px, e colapsa para modo "rail" (ícones) no desktop
- Não duplicar componente de navegação para mobile e desktop
- Tabelas devem ter modo alternativo em cards para telas pequenas
- Tema dark/light via CSS variables; cor primária configurável em um único arquivo de tokens

## Testes

- Toda function de `services` com regra de negócio (ex: `canAccessFeature`, cálculo de limite de plano) precisa de teste unitário
- Mudança em policy de RLS exige teste (SQL/pgTAP) confirmando que outro tenant não acessa o dado
- Fluxos cobertos por Playwright: login → dashboard, criar empresa → convidar membro, trocar empresa ativa

## Comandos do projeto

```bash
npm run dev          # ambiente local
npm run test         # testes unitários (Vitest)
npm run test:e2e     # Playwright
npm run lint
npm run typecheck
npx supabase migration up   # aplicar migrations locais
```

## O que NÃO fazer sem perguntar antes

- Não adicionar dependência nova sem justificar por que é necessária
- Não criar tabela sem `company_id` e sem policy de RLS na mesma migration
- Não implementar integração de pagamento fora das interfaces de `src/adapters/payment`
- Não remover ou enfraquecer uma policy de RLS existente para "resolver" um bug de acesso — investigar a causa raiz primeiro