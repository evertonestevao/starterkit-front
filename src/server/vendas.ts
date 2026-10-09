import "server-only";
import { getEmailProvider } from "@/adapters/email";
import { getServerEnv } from "@/config/env";
import { hojeISO } from "@/lib/acompanhamento";
import { qrPngDataUrl } from "@/lib/qr";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import {
  createSupabaseConfirmacaoVendaRepository,
  createSupabaseVendasPublicasRepository,
  createSupabaseVendasRepository,
} from "@/repositories/supabase/vendasRepository";
import { createAuditService } from "@/services/auditService";
import { createEmailService } from "@/services/emailService";
import {
  canVendas,
  createConfirmacaoVendaService,
  createVendasPublicasService,
  createVendasService,
  type VendasActor,
  type VendasService,
} from "@/services/vendasService";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import { getActiveTenant } from "./tenant";
import { hashUrlToken, makeUrlToken } from "./tokens";

/**
 * Vendas sobre o client do usuário (RLS ativa). O client com service_role
 * entra só para gravar o pedido de confirmação da chave Pix.
 */
export async function getVendasService(): Promise<VendasService> {
  const client = await getSupabaseServerClient();
  const email = createEmailService({ provider: getEmailProvider(), appUrl: getServerEnv().APP_URL });
  return createVendasService({
    repo: createSupabaseVendasRepository(client, getSupabaseAdminClient()),
    hoje: hojeISO,
    notifier: { sendVendaPixConfirmation: (input) => email.sendVendaPixConfirmation(input) },
    tokens: { make: makeUrlToken, hash: hashUrlToken },
    audit: createAuditService(createSupabaseAuditRepository(client)),
  });
}

/** Para as páginas e actions: ator autorizado, ou null (a página responde 404). */
export async function getVendasActorAutorizado(): Promise<VendasActor | null> {
  const { active } = await getActiveTenant();
  if (!active) return null;
  const liberado = active.acessos.includes("vendas");
  if (!canVendas(active.role, liberado)) return null;
  const { data } = await (await getSupabaseServerClient()).auth.getUser();
  if (!data.user) return null;
  return { companyId: active.id, role: active.role, liberado, userId: data.user.id, email: data.user.email ?? "" };
}

/** Página pública: lista pelo client do visitante, pedido pelo servidor. */
export async function getVendasPublicasService() {
  const client = await getSupabaseServerClient();
  return createVendasPublicasService({
    repo: createSupabaseVendasPublicasRepository(client, getSupabaseAdminClient()),
    qr: (texto) => qrPngDataUrl(texto, 512),
    tokens: { make: makeUrlToken, hash: hashUrlToken },
    appUrl: getServerEnv().APP_URL,
  });
}

/** Link de confirmação da chave enviado ao Responsável. */
export async function getConfirmacaoVendaService() {
  return createConfirmacaoVendaService(createSupabaseConfirmacaoVendaRepository(await getSupabaseServerClient()));
}
