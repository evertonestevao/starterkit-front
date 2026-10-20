#!/usr/bin/env node
/**
 * Confere a configuração de e-mail e manda um e-mail de teste de verdade.
 *
 *   node --env-file=.env.local scripts/testar-email.mjs voce@exemplo.com
 *
 * Use o arquivo de variáveis do ambiente que quer conferir (para produção,
 * um arquivo com as mesmas variáveis cadastradas na hospedagem). Não grava
 * nada no banco: só fala com a Resend.
 *
 * Sai com código 1 se algo estiver errado, dizendo o que corrigir.
 */

const destino = process.argv[2];
const env = process.env;
const problemas = [];
const avisos = [];

if (!destino || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) {
  console.error("Informe para onde mandar o teste:\n  node --env-file=.env.local scripts/testar-email.mjs voce@exemplo.com");
  process.exit(1);
}

console.log("Configuração");
console.log("  EMAIL_PROVIDER  =", env.EMAIL_PROVIDER ?? "(vazio → console: nada é enviado)");
console.log("  EMAIL_FROM      =", env.EMAIL_FROM ?? "(vazio)");
console.log("  EMAIL_FROM_NAME =", env.EMAIL_FROM_NAME ?? "(vazio → usa o nome do produto)");
console.log("  EMAIL_REPLY_TO  =", env.EMAIL_REPLY_TO ?? "(vazio)");
console.log("  RESEND_API_KEY  =", env.RESEND_API_KEY ? `definida (termina em ...${env.RESEND_API_KEY.slice(-4)})` : "(vazia)");
console.log("  APP_URL         =", env.APP_URL ?? "(vazio → http://localhost:3000)");
console.log("");

if (env.EMAIL_PROVIDER !== "resend") problemas.push("EMAIL_PROVIDER precisa ser 'resend'. Com 'console' (ou vazio) o sistema não envia e-mail nenhum.");
if (!env.RESEND_API_KEY) problemas.push("Falta RESEND_API_KEY (crie em resend.com → API Keys).");
if (!env.EMAIL_FROM) problemas.push("Falta EMAIL_FROM (ex.: no-reply@seudominio.com, num domínio verificado na Resend).");
else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.EMAIL_FROM)) problemas.push("EMAIL_FROM precisa ser só o endereço (ex.: no-reply@seudominio.com). O nome vai em EMAIL_FROM_NAME.");
if (!env.APP_URL || /localhost|127\.0\.0\.1/.test(env.APP_URL)) {
  avisos.push("APP_URL aponta para localhost: os links dos e-mails (convite) não vão abrir para quem recebe. Em produção use https://seu-dominio.");
} else if (!env.APP_URL.startsWith("https://")) {
  avisos.push("APP_URL não usa https.");
}

for (const a of avisos) console.log("AVISO:", a);
if (problemas.length > 0) {
  for (const p of problemas) console.error("ERRO:", p);
  console.error("\nCorrija o que está acima e rode de novo. Passo a passo em docs/email-producao.md.");
  process.exit(1);
}

const dominio = env.EMAIL_FROM.split("@")[1];
const nome = (env.EMAIL_FROM_NAME ?? "AssembleiaApp").replace(/["<>\r\n]/g, "").trim();
const link = `${(env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/login`;

console.log(`Enviando teste para ${destino} como "${nome} <${env.EMAIL_FROM}>"...`);
let res;
try {
  res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${nome} <${env.EMAIL_FROM}>`,
      to: [destino],
      ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
      subject: "Teste de e-mail do sistema da igreja",
      text: `Se você recebeu este e-mail, o envio está funcionando.\n\nOs links dos e-mails vão apontar para: ${link}`,
      html: `<p>Se você recebeu este e-mail, o envio está funcionando.</p><p>Os links dos e-mails vão apontar para: <a href="${link}">${link}</a></p>`,
    }),
  });
} catch (err) {
  console.error("ERRO: não consegui falar com a Resend (sem internet ou bloqueio de rede):", err.message);
  process.exit(1);
}

const corpo = await res.json().catch(() => ({}));
if (res.ok) {
  console.log(`\nOK: a Resend aceitou o envio (id ${corpo.id}).`);
  console.log(`Confira a caixa de entrada de ${destino}, e também a pasta de spam.`);
  console.log(`Se caiu no spam: confira em resend.com → Domains se ${dominio} está com SPF e DKIM "Verified".`);
  process.exit(0);
}

const mensagem = String(corpo.message ?? corpo.error ?? "");
console.error(`\nERRO: a Resend recusou o envio (HTTP ${res.status}). ${mensagem}`);
if (res.status === 401) {
  console.error("→ A RESEND_API_KEY está errada ou foi apagada. Gere outra em resend.com → API Keys.");
} else if (res.status === 403 && /domain|verif/i.test(mensagem)) {
  console.error(`→ O domínio ${dominio} ainda não está verificado na Resend. Em resend.com → Domains, adicione ${dominio},`);
  console.error("  cadastre os registros DNS que ela mostrar (SPF e DKIM) e espere ficar \"Verified\".");
} else if (res.status === 403 && /testing|own email/i.test(mensagem)) {
  console.error("→ A conta da Resend ainda está em modo de teste: só envia para o seu próprio e-mail de cadastro.");
  console.error(`  Verifique o domínio ${dominio} em resend.com → Domains para enviar a qualquer pessoa.`);
} else if (res.status === 422) {
  console.error("→ Algum campo está inválido. O mais comum: EMAIL_FROM com um domínio diferente do verificado na Resend.");
} else if (res.status === 429) {
  console.error("→ Limite de envios da Resend atingido. Espere um pouco ou confira o plano da conta.");
}
console.error("\nPasso a passo completo em docs/email-producao.md.");
process.exit(1);
