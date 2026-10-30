# Como criar um novo produto a partir do starter

Guia para começar um SaaS novo sobre este kit usando o Claude Code (ou outro agente de código).
Traz um **prompt modelo** para copiar, explica o que preencher e como conduzir as fases seguintes.

Antes de seguir, conheça o que o kit já faz ([FUNCIONALIDADES.md](FUNCIONALIDADES.md)) e o roteiro
técnico ([DOCUMENTACAO.md › 6.2](DOCUMENTACAO.md#62-criando-um-novo-saas-a-partir-deste-kit)).

---

## 1. A ideia em uma frase

**A fundação não se reescreve. Você troca a identidade e adiciona o domínio do produto.**

O prompt serve para dizer ao agente **o que é o produto**, **quais módulos de negócio ele tem** e
**o que muda nos planos**. Login, empresas, convites, billing, auditoria e LGPD já existem e não
devem ser refeitos.

## 2. Passo a passo de uso

1. **Clone o kit com histórico novo** (comandos em
   [DOCUMENTACAO.md › 6.2](DOCUMENTACAO.md#62-criando-um-novo-saas-a-partir-deste-kit), "Dia 1"),
   rode `npm install`, `npx supabase start` e copie `.env.example` para `.env.local`.
2. **Preencha o prompt modelo** (seção 3) num editor de texto. Separe 20–30 minutos: quanto mais
   claro o domínio, menos retrabalho.
3. **Abra o Claude Code na pasta do clone.** O agente lê o `CLAUDE.md` sozinho, e é ele que garante
   as regras de arquitetura e segurança.
4. **Entre em modo de planejamento** (Shift+Tab até "plan mode") e cole o prompt. Revise o plano
   antes de aprovar: confira tabelas, papéis e planos.
5. **Execute uma fase por vez** (seção 6). Ao fim de cada fase, rode os testes e faça commit antes
   de pedir a próxima.
6. **Antes do primeiro cliente**, siga o checklist da seção 8.

## 3. Prompt modelo

Copie o bloco abaixo e troque tudo que está entre `[colchetes]`. Apague as linhas opcionais que não
se aplicam.

```text
Vamos criar um novo produto SaaS a partir deste starter kit. Leia antes CLAUDE.md,
FUNCIONALIDADES.md e DOCUMENTACAO.md (seção 6.2) e siga as regras de arquitetura deles.

## O produto
- Nome: [Nome do produto]
- Tagline (1 frase): [O que ele resolve, para quem]
- Domínio: [https://meuproduto.com.br]
- Público: [quem usa — ex.: clínicas de estética com 2 a 20 profissionais]
- Problema principal: [a dor que o produto resolve, em 2-3 frases]
- Cor primária da marca: [#0F766E]

## Dados legais (rodapé e políticas)
- Razão social: [Minha Empresa Ltda.]
- CNPJ: [00.000.000/0000-00]
- Endereço: [Rua, nº — Cidade/UF — CEP]
- Email de suporte: [suporte@meuproduto.com.br]
- Email do encarregado de dados (DPO): [privacidade@meuproduto.com.br]

## Papéis
Mantenha owner, admin e member. [Opcional: papéis extras e o que cada um pode fazer —
ex.: "recepcionista: vê e cria agendamentos, não vê financeiro".]

## Módulos de negócio (o que é novo)
Para cada módulo: entidade, campos principais, quem pode ver/criar/editar/apagar e regras.

1. [Módulo 1 — ex.: Pacientes]
   - Campos: [nome, telefone, data de nascimento, observações]
   - Permissões: [todos veem; admin e owner editam; só owner apaga]
   - Regras: [telefone único por empresa; limite de pacientes por plano]
2. [Módulo 2 — ex.: Agendamentos]
   - Campos: [...]
   - Permissões: [...]
   - Regras: [...]
3. [...]

## Planos
| Plano | Preço/mês | Membros inclusos | Membro extra | Limites e recursos do produto |
|---|---|---|---|---|
| [Free] | [R$ 0] | [2] | [—] | [até 50 pacientes, sem relatórios] |
| [Pro] | [R$ 149] | [10] | [R$ 19,90] | [pacientes ilimitados, relatórios, lembretes] |
| [Enterprise] | [R$ 599] | [50] | [R$ 29,90] | [tudo + API] |

## Integrações
- Pagamento: [Asaas (já pronto: PIX, boleto, cartão) | Stripe (já pronto) | outro: Mercado Pago,
  Pagar.me → novo adapter de PaymentGateway, seguindo PaymentGateway.ts]
- Email: [Resend (já pronto) | outro]
- [Opcional: WhatsApp/SMS → implementar NotificationProvider com o provedor X]
- [Opcional: outra API externa e para que serve]

## Landing page
Reescreva src/features/marketing/content.ts para o produto: proposta, dores, benefícios,
planos (espelhando as migrations) e FAQ. [Opcional: seções a remover ou adicionar.]
Não invente depoimentos, números ou promessas que o produto não cumpre.

## Fora do escopo agora
[O que NÃO fazer nesta etapa — ex.: app mobile, painel do operador, i18n.]

## Como trabalhar
1. Primeiro, me mostre um plano dividido em fases (identidade → planos → um módulo por vez
   → landing → testes), com as tabelas e migrations que vai criar.
2. Execute uma fase por vez, com testes, e pare para eu revisar ao fim de cada uma.
3. Toda tabela nova: company_id, deleted_at, RLS, policies e GRANTs na mesma migration,
   mais o bloco de teste em supabase/tests/rls_test.sql.
4. Atualize FUNCIONALIDADES.md a cada módulo entregue.
5. Pergunte antes de adicionar dependência nova ou de mexer na fundação
   (auth, tenant, errors, proxy, adapters existentes).
```

## 4. O que preencher e por quê

| Campo | Para que o agente usa | Dica |
|---|---|---|
| **Nome, tagline, domínio** | `src/config/brand.ts`, títulos de página, metadata, landing | A tagline vira descrição em buscadores: seja concreto. |
| **Público e problema** | Textos da landing, nomes de campos, decisões de UX | Quanto mais específico, melhores os defaults. |
| **Cor primária** | Tokens `--primary`, `--ring` e `--sidebar-primary` em `globals.css` (claro e escuro) | Uma cor só. O agente ajusta o contraste. |
| **Dados legais** | `brand.legal` no rodapé, `/privacy` e `/refund` | Obrigatórios por lei (Decreto 7.962/2013). |
| **Papéis** | Migration em `roles` e `defineRole()` no `permissionService` | Só crie papel novo se as permissões forem de fato diferentes. |
| **Módulos** | Migration, types, repository, service com testes, UI, menu e teste de RLS | É a parte mais importante. Ver seção 5. |
| **Planos** | Migrations de seed de planos, `canAccessFeature` e seção de planos da landing | Use nomes de limite claros: `max_patients`, `reports`, `api_access`. |
| **Integrações** | Novos adapters atrás das interfaces existentes | Provedor novo nunca é chamado direto de um service ou componente. |
| **Fora do escopo** | Evita que o agente construa o que você não pediu | Liste o que é tentador mas não é agora. |

## 5. Como descrever um módulo bem

Um módulo bem descrito responde a quatro perguntas:

1. **O que é guardado?** A entidade e seus campos, com tipo quando não for óbvio (data, valor em
   reais, enum de status).
2. **Quem faz o quê?** Ver, criar, editar e apagar, por papel.
3. **Quais regras valem?** Unicidade, limites por plano, transições de status, cálculos.
4. **Como aparece?** Listagem, detalhe, formulário e, se houver, gráfico no dashboard.

| Fraco | Bom |
|---|---|
| "Módulo de agendamentos" | "Agendamentos: paciente, profissional (membro da empresa), data/hora, duração (15–240 min), status (agendado → confirmado → realizado ou cancelado). Member vê só os próprios; admin e owner veem todos. Não pode haver dois agendamentos sobrepostos para o mesmo profissional. Free: 100 por mês." |
| "Financeiro" | "Lançamentos: tipo (receita/despesa), valor em centavos, data, categoria, agendamento opcional. Só owner e admin. Dashboard: receita × despesa por mês (gráfico de linha)." |

## 6. Fases recomendadas e prompts de continuação

Peça uma fase por vez. Ao fim de cada uma, rode `npm run typecheck`, `npm run test` e
`npm run test:rls`, revise e faça commit.

| Fase | Prompt de continuação |
|---|---|
| 1. Identidade | "Execute a fase 1: brand.ts, dados legais, cor primária, nome no package.json e project_id do Supabase." |
| 2. Planos | "Execute a fase 2: atualize as migrations de planos e os limites, e ajuste a seção de planos da landing." |
| 3+. Um módulo por fase | "Execute o módulo [Pacientes] seguindo o roteiro da DOCUMENTACAO 6.2: migration com RLS, types, repository, service com testes, UI com tabela e cards, item de menu, auditoria e teste de RLS." |
| Landing | "Reescreva a landing para o produto com o conteúdo do prompt inicial. Sem números ou depoimentos inventados." |
| Textos legais | "Adapte /privacy e /refund aos dados e integrações do produto. Mantenha o aviso de texto de exemplo até a revisão jurídica." |
| E2E | "Crie os testes Playwright do fluxo principal de [módulo]." |
| Revisão final | "Revise o produto contra a seção 'ANTES DE IR PARA PRODUÇÃO' da DOCUMENTACAO e liste o que falta." |

Para ajustes no meio do caminho, seja específico: "No módulo Agendamentos, member também pode
cancelar os próprios agendamentos" é melhor que "ajuste as permissões".

## 7. O que não pedir (e por quê)

| Evite | Motivo |
|---|---|
| "Refaça o login" ou "troque o sistema de empresas" | É a fundação testada. Personalize, não reescreva. |
| "Chame a API do [provedor] direto no componente" | Quebra a arquitetura. Integrações passam por adapters. |
| "Crie a tabela sem company_id, é só um cadastro" | Todo dado de negócio pertence a uma empresa. Exceções (catálogos globais) precisam de justificativa. |
| "Desliga a RLS para funcionar" | Bug de acesso se investiga na causa. RLS não se enfraquece. |
| "Faz tudo de uma vez" | Fases pequenas são revisáveis e testáveis. Um prompt gigante gera um diff que ninguém revisa. |
| "Inventa uns depoimentos para a landing" | Propaganda enganosa (CDC). Só depoimentos reais e autorizados. |

## 8. Checklist antes do primeiro cliente

- [ ] `brand.ts` com nome, URL e dados legais reais
- [ ] Termos, Privacidade e Reembolso revisados por advogado e publicados
- [ ] Planos da landing iguais às migrations
- [ ] Todo módulo novo com teste de RLS e testes unitários das regras
- [ ] `FUNCIONALIDADES.md` descreve os módulos novos
- [ ] Seção "⚠️ ANTES DE IR PARA PRODUÇÃO" da DOCUMENTACAO concluída, incluindo o smoke test
