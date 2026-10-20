"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ipDoPedido } from "@/lib/antiRobo";
import { comAviso } from "@/lib/avisos";
import { qrPngDataUrl } from "@/lib/qr";
import { AppError } from "@/lib/errors";
import { createRateLimiter } from "@/server/rateLimit";
import {
  churchDaConta,
  getAssumirService,
  getIgrejaQueCadastra,
  getRedeCadastroActor,
  getRedeCadastroService,
  getTrocaDeResponsavelService,
} from "@/server/redeCadastro";
import { ACTIVE_COMPANY_COOKIE } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

/**
 * Cadastro de igrejas pela rede (quem tem a permissão na igreja de cima) e o
 * "assumir" (a pessoa convidada). O service valida; o banco confere de novo.
 */

const PAGINA = "/dashboard/settings/vinculos";
/** Criar conta pelo link: poucas tentativas por pessoa e por convite. */
const porPessoa = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });
const porConvite = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();

async function ator() {
  const actor = await getRedeCadastroActor();
  if (!actor) throw new AppError("forbidden", "Você não tem permissão para cadastrar igrejas na rede.");
  return actor;
}

/** Enquanto ninguém assumiu: nome, complemento, endereço e "Sobre" da página. */
export async function editarIgrejaAguardandoAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  try {
    await (
      await getRedeCadastroService()
    ).editar(await ator(), {
      churchId: texto(fd, "churchId"),
      nome: texto(fd, "name"),
      sobrenome: texto(fd, "sobrenome") || null,
      sobre: texto(fd, "sobre") || null,
      endereco: {
        cep: texto(fd, "cep"),
        logradouro: texto(fd, "logradouro"),
        numero: texto(fd, "numero"),
        complemento: texto(fd, "complemento"),
        bairro: texto(fd, "bairro"),
        cidade: texto(fd, "cidade"),
        uf: texto(fd, "uf"),
      },
    });
    revalidatePath(PAGINA);
    return { success: "Dados da igreja salvos." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function cadastrarIgrejaDaRedeAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  try {
    await (
      await getRedeCadastroService()
    ).cadastrar(await ator(), {
      maeId: texto(fd, "maeId"),
      tipo: texto(fd, "tipo"),
      nome: texto(fd, "nome"),
      sobrenome: texto(fd, "sobrenome") || null,
    });
    revalidatePath(PAGINA);
    revalidatePath("/dashboard/rede");
    return { success: "Igreja cadastrada. Agora convide quem vai assumir." };
  } catch (err) {
    return toActionError(err);
  }
}

/** O link só aparece nesta resposta: o banco guarda o hash. */
export interface ConviteGeradoState {
  error?: string;
  campo?: string;
  success?: {
    link: string;
    expiraEm: string;
    nome: string;
    whatsapp: string | null;
    qrDataUrl: string;
  };
}

export async function convidarResponsavelAction(
  _prev: ConviteGeradoState | undefined,
  fd: FormData,
): Promise<ConviteGeradoState> {
  try {
    const gerado = await (
      await getRedeCadastroService()
    ).convidar(await ator(), {
      churchId: texto(fd, "churchId"),
      nome: texto(fd, "nome"),
      email: texto(fd, "email"),
      cargo: texto(fd, "cargo") || null,
      whatsapp: texto(fd, "whatsapp") || null,
      substituir: fd.get("substituir") === "on",
    });
    revalidatePath(PAGINA);
    revalidatePath("/dashboard/rede");
    // QR Code do link: para assumir na hora, apontando a câmera do celular.
    return {
      success: { ...gerado, qrDataUrl: await qrPngDataUrl(gerado.link, 512) },
    };
  } catch (err) {
    return toActionError(err) as ConviteGeradoState;
  }
}

/** Tira o acesso de um Responsável de uma igreja abaixo, agora. */
export async function removerResponsavelAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  try {
    const { ficouSemResponsavel } = await (
      await getTrocaDeResponsavelService()
    ).remover(await ator(), texto(fd, "memberId"));
    revalidatePath("/dashboard/rede");
    return {
      success: ficouSemResponsavel
        ? "Acesso removido. A igreja voltou a aguardar responsável e a mensalidade fica pausada."
        : "Acesso removido.",
    };
  } catch (err) {
    return toActionError(err);
  }
}

/** Esqueceu a senha: o e-mail oficial de recuperação vai para o e-mail do Responsável. */
export async function enviarRecuperacaoAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  try {
    const mae = await getIgrejaQueCadastra();
    if (!mae) throw new AppError("forbidden", "Você não tem permissão para isso.");
    const email = await (
      await getTrocaDeResponsavelService()
    ).enviarRecuperacao(await ator(), mae.id, texto(fd, "memberId"));
    return { success: `E-mail para criar nova senha enviado para ${email}.` };
  } catch (err) {
    return toActionError(err);
  }
}

/** Troca concluída: avisa quem saiu e a igreja de cima (sem travar a entrada). */
async function avisarSeTrocou(r: { companyId: string; igreja: string; removidos: string[] }) {
  if (r.removidos.length === 0) return;
  const churchId = await churchDaConta(r.companyId);
  if (churchId) await (await getTrocaDeResponsavelService()).avisarTroca(churchId, r);
}

/** Grava a igreja assumida como a ativa (a pessoa já entra nela). */
async function abrirIgreja(companyId: string) {
  (await cookies()).set(ACTIVE_COMPANY_COOKIE, companyId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Já logado com o e-mail do convite. */
export async function assumirIgrejaAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  let companyId: string;
  try {
    const assumida = await (await getAssumirService()).assumir(texto(fd, "token"));
    companyId = assumida.companyId;
    await abrirIgreja(companyId);
    await avisarSeTrocou(assumida);
  } catch (err) {
    return toActionError(err);
  }
  redirect(comAviso("/dashboard", "igreja-assumida"));
}

/** Primeiro acesso: cria a senha, entra e assume. */
export async function criarContaEAssumirAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  let companyId: string;
  try {
    const token = texto(fd, "token");
    await porPessoa.consume(`assumir:ip:${ipDoPedido(await headers())}`);
    await porConvite.consume(`assumir:convite:${token.slice(0, 16)}`);
    const assumida = await (
      await getAssumirService()
    ).criarContaEAssumir(token, {
      nome: texto(fd, "nome"),
      senha: String(fd.get("senha") ?? ""),
    });
    companyId = assumida.companyId;
    await abrirIgreja(companyId);
    await avisarSeTrocou(assumida);
  } catch (err) {
    return toActionError(err);
  }
  redirect(comAviso("/dashboard", "igreja-assumida"));
}
