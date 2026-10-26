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
- Ao implementar gateway de pagamento, sempre atrás da interface `PaymentGateway` (`src/adapters/payment`) — nunca chamar SDK do provedor direto de um service ou componente

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

## Documentação de funcionalidades

- `FUNCIONALIDADES.md` (raiz) descreve todas as funções do sistema: o que fazem, quem pode usar e quais regras se aplicam
- Toda mudança que cria, altera ou remove uma funcionalidade, permissão, limite, rota ou integração **atualiza a seção correspondente de `FUNCIONALIDADES.md` no mesmo commit**, junto com a data de "Última atualização"
- Mudança só interna (refatoração, teste, estilo) que não altera comportamento não precisa atualizar

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
- Não implementar integração de pagamento fora da interface `PaymentGateway`
- Não remover ou enfraquecer uma policy de RLS existente para "resolver" um bug de acesso — investigar a causa raiz primeiro