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
| `pastor.sede@dev.local` | owner da sede | Vê a árvore inteira: contagem de pedidos de oração e visitantes de todas as igrejas abaixo |
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
- `/plataforma` — moderação (entre com `plataforma@dev.local`)
