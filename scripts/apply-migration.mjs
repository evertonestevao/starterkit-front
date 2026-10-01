/**
 * Aplica migrations no banco de DEV (Supabase local no mini PC).
 *
 * O CLI do Supabase não conecta ao mini PC, então o caminho é este runner:
 * cada arquivo roda numa transação e é registrado em
 * `supabase_migrations.schema_migrations`, como o CLI faria. Uma migration já
 * registrada é pulada.
 *
 *   npm run db:apply -- supabase/migrations/20260927140000_church_onboarding_network.sql
 *   npm run db:apply -- supabase/migrations/a.sql supabase/migrations/b.sql
 *
 * Conexão: variável DB, ou o padrão do Supabase local no mini PC
 * (postgres:postgres@192.168.3.240:54322). A senha padrão só vale para o banco
 * de dev na LAN.
 *
 * TRAVA: recusa qualquer host que não seja localhost ou rede privada. Stage e
 * produção são bancos online — quem quiser aplicar lá precisa passar --remoto
 * de propósito, depois de conferir que a migration passou antes por stage.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import pg from "pg";

const DEV_PADRAO = "postgresql://postgres:postgres@192.168.3.240:54322/postgres";

const args = process.argv.slice(2);
const remoto = args.includes("--remoto");
const arquivos = args.filter((arg) => !arg.startsWith("--"));

if (arquivos.length === 0) {
  console.error("Uso: npm run db:apply -- <arquivo.sql> [outro.sql ...]");
  process.exit(1);
}

const connectionString = process.env.DB ?? DEV_PADRAO;
const host = new URL(connectionString).hostname;
const hostLocal =
  host === "localhost" ||
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);

if (!hostLocal && !remoto) {
  console.error(
    `Recusado: ${host} não é um banco local. Este runner é do dev; para um banco online passe --remoto conscientemente.`,
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  for (const arquivo of arquivos) {
    const nome = basename(arquivo);
    const versao = nome.slice(0, 14);
    const { rowCount } = await client.query(
      "select 1 from supabase_migrations.schema_migrations where version = $1",
      [versao],
    );
    if (rowCount) {
      console.log(`já registrada, pulei: ${nome}`);
      continue;
    }
    await client.query("begin");
    try {
      await client.query(readFileSync(arquivo, "utf8"));
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2) on conflict do nothing",
        [versao, nome.replace(/^\d+_/, "").replace(/\.sql$/, "")],
      );
      await client.query("commit");
      console.log(`aplicada: ${nome}`);
    } catch (erro) {
      await client.query("rollback");
      console.error(`FALHOU e foi desfeita: ${nome}`);
      throw erro;
    }
  }
} finally {
  await client.end();
}
