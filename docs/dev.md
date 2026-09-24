# Ambiente de desenvolvimento

## Banco

O banco de dev roda no mini PC (`192.168.3.240:54322`). Para recriá-lo do zero —
apaga tudo, aplica todas as migrations em ordem e roda o seed:

```bash
npx supabase db reset --db-url "postgresql://postgres:postgres@<host>:54322/postgres"
```

Se o CLI recusar a conexão com `tls error (server refused TLS connection)`, o
banco não aceita TLS e o caminho é aplicar as migrations por um cliente
Postgres comum, na ordem de `supabase/migrations`, e depois rodar
`supabase/seed.sql`.

Testes de RLS contra o mesmo banco:

```bash
SUPABASE_DB_URL=postgresql://postgres:postgres@<host>:54322/postgres npm run test:rls
```

## Contas de teste

Todas com a senha **`dev123456`**. Criadas por `supabase/seed.sql`, que **não**
vai para produção.

| Conta | Papel | Para quê |
| --- | --- | --- |
| `pastor.sede@dev.local` | owner da sede | Vê a rede inteira em Configurações → Vínculos (com busca/paginação); pedido de oração continua só da própria igreja |
| `pastor.zonanorte@dev.local` | owner de subsede | Vê a subsede e as 4 congregações dela; não vê as outras subsedes |
| `pastor.zonanorte.vilanova@dev.local` | owner de congregação | Vê só a própria igreja |
| `auxiliar.zonanorte@dev.local` | member de subsede | Não lê pedido de oração nem patrocinador, e não troca a chave PIX |
| `patrocinador.pago@dev.local` | patrocinador em dia | Um primeiro patrocínio + uma expansão; aparece na vitrine |
| `patrocinador.atraso@dev.local` | patrocinador atrasado há 5 dias | Dentro da carência (15 dias): **continua** na vitrine |
| `patrocinador.sumido@dev.local` | patrocinador atrasado há 40 dias | Fora da carência: **sumiu** da vitrine, e volta sozinho se a cobrança for paga |
| `plataforma@dev.local` | moderação da plataforma | `/plataforma` (igrejas, configurações, piloto, moderação) |

Os pastores das outras 11 congregações seguem o padrão
`pastor.<subsede>.<congregacao>@dev.local`, por exemplo
`pastor.litoral.bairroalto@dev.local`.

## A árvore do seed

```
Comunidade da Graça (sede)
├── Graça Zona Norte (subsede)
│   ├── Vila Nova · Jardim Aurora · Parque Industrial · Bairro Alto (congregações)
├── Graça Zona Sul (subsede)
│   └── (as mesmas 4 congregações)
└── Graça Litoral (subsede)
    └── (as mesmas 4 congregações)
```

Cada igreja tem programação semanal, um evento com inscritos, pedidos de
oração, visitantes e visitas das últimas 8 semanas. Sede, subsedes e as
congregações "Vila Nova" têm chave PIX cadastrada — as demais ficam sem, de
propósito, para exercitar a página sem dízimo configurado.

## Páginas úteis

- `/igreja/<public_code>` — página pública (ex.: `/igreja/zona-norte-vila-nova`)
- `/igreja/<public_code>?origem=qr` — mesma página, contando como leitura de QR
- `/dashboard` — painel da igreja (entre com um pastor)
- `/dashboard/settings/igreja` — nome, endereço, redes, logo e o endereço público
- `/dashboard/settings/pix` — chave PIX dos dízimos
- `/dashboard/settings/recebimento` — cadastro opcional da subconta e o cartão
- `/plataforma` — moderação (entre com `plataforma@dev.local`)
- `/dashboard/settings/vinculos` — vínculo entre igrejas (a "rede"): a igreja-mãe gera um link (a validade — 7, 15,
  30 dias ou sem validade — e o número de pedidos — de 1 a 1000 ou sem limite — são escolhidos na hora, sem
  padrão), decide os pedidos, muda a função de quem está ligada a ela e desfaz vínculos
- `/vinculo/<token>` — página de quem recebe o link: lê como funciona e pede o vínculo (ou não). O link não liga
  nada: a rede só muda quando a igreja-mãe aprova o pedido. Exige login; quem não tem conta cria a conta e a igreja
  por ali e volta ao link

## Recebimento por cartão (opcional)

Em dev, `RECEIVING_PROVIDER=fake` aprova a subconta na hora — em produção a
análise leva de horas a dias, e é por isso que a tela tem o estado "em
análise". `RECEIVING_KEY_SECRET` é a chave que cifra a chave de API de cada
subconta; gere a sua com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Para simular uma doação chegando (o webhook é por igreja, com token próprio):
pegue o token no `church_payment_accounts.webhook_token_hash` — ele é só o
hash, então em dev o caminho mais simples é refazer o cadastro e capturar o
token gerado no log, ou chamar a rota com o token que o `fake` espera:

```bash
curl -X POST http://localhost:3000/api/webhooks/donations/fake   -H "content-type: application/json" -H "x-webhook-token: <token da igreja>"   -d '{"accountReference":"fake_acc_<documento>","paymentId":"pay_1","amountCents":5000,"status":"recebida"}'
```
