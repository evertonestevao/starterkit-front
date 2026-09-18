/**
 * Cadastra um operador da moderação da plataforma.
 *
 * `platform_staff` não tem GRANT para `authenticated` de propósito: ninguém
 * se promove pela aplicação. A entrada é por aqui, com service_role, e o
 * usuário precisa já existir no Auth (fazer login uma vez antes).
 *
 *   node scripts/add-platform-staff.mjs alguem@exemplo.com
 *   node scripts/add-platform-staff.mjs alguem@exemplo.com --remover
 *
 * Remover é soft delete (`deleted_at`): as decisões que a pessoa tomou seguem
 * atribuídas a ela em `platform_staff_actions`.
 *
 * Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env.local.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const env = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) env[match[1]] = match[2];
    }
  } catch {
    // Sem .env.local: cai no ambiente do processo.
  }
  return { ...env, ...process.env };
}

/**
 * Tudo dentro de main() e sem process.exit(): no Windows, sair à força com o
 * client HTTP do Supabase ainda com conexão aberta derruba o Node numa
 * assertion do libuv — e o script "falha" depois de já ter feito o trabalho.
 */
async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const remover = process.argv.includes("--remover");
  if (!email) {
    console.error("uso: node scripts/add-platform-staff.mjs <email> [--remover]");
    return 1;
  }

  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
    return 1;
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  // A API de admin não busca por email, então paginamos até achar.
  let user = null;
  for (let page = 1; page <= 20 && !user; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("falha ao listar usuários:", error.message);
      return 1;
    }
    if (data.users.length === 0) break;
    user = data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
  }

  if (!user) {
    console.error(`nenhum usuário com o email ${email}. Faça login uma vez com ele e rode de novo.`);
    return 1;
  }

  if (remover) {
    const { error } = await admin
      .from("platform_staff")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (error) {
      console.error("falha ao remover:", error.message);
      return 1;
    }
    console.log(`ok: ${email} não é mais moderação da plataforma`);
    return 0;
  }

  const { error } = await admin
    .from("platform_staff")
    .upsert({ user_id: user.id, email, deleted_at: null }, { onConflict: "user_id" });

  if (error) {
    console.error("falha ao cadastrar:", error.message);
    return 1;
  }

  console.log(`ok: ${email} agora é moderação da plataforma (${user.id})`);
  return 0;
}

process.exitCode = await main();
