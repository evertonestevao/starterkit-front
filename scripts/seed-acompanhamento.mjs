/**
 * Aplica o seed de demonstração de Chamada e Acompanhamento
 * (supabase/seed_acompanhamento.sql) no banco de DEV, numa transação.
 *
 *   node scripts/seed-acompanhamento.mjs
 *   node scripts/seed-acompanhamento.mjs --dry-run   # roda e desfaz (ROLLBACK)
 *   node scripts/seed-acompanhamento.mjs --reset     # apaga a rede demo-* e recria
 *
 * Conexão: variável DB, ou o padrão do Supabase local no mini PC. Cria contas
 * com senha conhecida, então recusa qualquer host fora da rede local — não
 * há opção para rodar em stage/produção.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const DEV_PADRAO = "postgresql://postgres:postgres@192.168.3.240:54322/postgres";
const dryRun = process.argv.includes("--dry-run");
const reset = process.argv.includes("--reset");

// Apaga só o que o seed criou: igrejas/empresas demo-* e as contas *.demo@dev.local.
const RESET_SQL = `
  delete from public.churches where slug like 'demo-%' and tipo = 'congregacao';
  delete from public.churches where slug like 'demo-%' and tipo = 'subsede';
  delete from public.churches where slug like 'demo-%';
  delete from public.companies where slug like 'demo-%';
  delete from auth.users where email like '%.demo%@dev.local' or email = 'secretario.demo@dev.local';
`;

const connectionString = process.env.DB ?? DEV_PADRAO;
const host = new URL(connectionString).hostname;
const hostLocal = host === "localhost" || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
if (!hostLocal) {
  console.error(`Recusado: ${host} não é banco local. O seed de demonstração só roda em dev.`);
  process.exit(1);
}

const sql = readFileSync(new URL("../supabase/seed_acompanhamento.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("begin");
  if (reset) await client.query(RESET_SQL);
  await client.query(sql);
  await client.query(dryRun ? "rollback" : "commit");
  console.log(dryRun ? "seed OK (dry-run: nada gravado)" : "seed de demonstração aplicado");
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error("falhou:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
