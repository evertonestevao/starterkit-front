"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { centavosDe } from "@/lib/ebd";
import { getEbdActor, getEbdService } from "@/server/ebd";
import type { EbdActor } from "@/services/ebdService";
import type { EbdPessoaBusca } from "@/types/ebd";
import { toActionError, type ActionState } from "./action-state";

/** Server actions da EBD. Empresa, papel e autorizações vêm da sessão. */

async function ator(): Promise<EbdActor> {
  const actor = await getEbdActor();
  if (!actor) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  return actor;
}

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "");
}

function revalidar() {
  revalidatePath("/dashboard/ebd", "layout");
  revalidatePath("/dashboard/membros", "layout");
}

export async function salvarClasseAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const service = await getEbdService();
    const actor = await ator();
    const id = texto(formData, "id");
    const dados = {
      nome: texto(formData, "nome"),
      faixaEtaria: texto(formData, "faixaEtaria"),
      sala: texto(formData, "sala"),
      idadeMinima: texto(formData, "idadeMinima"),
      idadeMaxima: texto(formData, "idadeMaxima"),
    };
    if (id) await service.editarClasse(actor, id, dados);
    else await service.criarClasse(actor, dados);
    revalidar();
    return { success: id ? "Classe atualizada." : "Classe criada." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function definirClasseAtivaAction(classeId: string, ativa: boolean): Promise<ActionState> {
  try {
    await (await getEbdService()).definirClasseAtiva(await ator(), classeId, ativa);
    revalidar();
    return { success: ativa ? "Classe reaberta." : "Classe encerrada. O histórico continua guardado." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function adicionarProfessorAction(classeId: string, membroId: string): Promise<ActionState> {
  try {
    await (await getEbdService()).adicionarProfessor(await ator(), classeId, membroId);
    revalidar();
    return { success: "Professor(a) adicionado(a)." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function removerProfessorAction(classeId: string, membroId: string): Promise<ActionState> {
  try {
    await (await getEbdService()).removerProfessor(await ator(), classeId, membroId);
    revalidar();
    return { success: "Professor(a) removido(a) da classe." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Busca no rol (gestão), para matricular ou indicar professor. */
export async function buscarPessoasEbdAction(
  termo: string,
): Promise<{ pessoas?: EbdPessoaBusca[]; error?: string }> {
  try {
    return { pessoas: await (await getEbdService()).buscarPessoas(await ator(), termo) };
  } catch (err) {
    return { error: toActionError(err).error };
  }
}

export async function matricularAction(classeId: string, membroId: string): Promise<ActionState> {
  try {
    await (await getEbdService()).matricular(await ator(), classeId, membroId);
    revalidar();
    return { success: "Matrícula feita." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function matricularNovoAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await (await getEbdService()).matricularNovo(await ator(), {
      classeId: texto(formData, "classeId"),
      nome: texto(formData, "nome"),
      telefone: texto(formData, "telefone"),
      nascimento: texto(formData, "nascimento"),
      visitanteId: texto(formData, "visitanteId"),
    });
    revalidar();
    return { success: "Aluno matriculado." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function encerrarMatriculaAction(matriculaId: string): Promise<ActionState> {
  try {
    await (await getEbdService()).encerrarMatricula(await ator(), matriculaId);
    revalidar();
    return { success: "Aluno saiu da classe. O histórico continua guardado." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Chamada da classe (a tela monta tudo em memória e envia de uma vez). */
export async function salvarAulaEbdAction(input: {
  classeId: string;
  data: string;
  licao: string;
  biblias: number;
  revistas: number;
  oferta: string;
  presencas: Array<{ membroId: string; estado: string }>;
  visitantes: Array<{ nome: string; telefone: string | null; membroId: string | null }>;
}): Promise<ActionState> {
  try {
    const ofertaCentavos = centavosDe(input.oferta);
    if (ofertaCentavos === null) throw new AppError("validation_error", "Valor da oferta inválido. Ex.: 25,50");
    await (await getEbdService()).salvarAula(await ator(), { ...input, ofertaCentavos });
    revalidar();
    return { success: "Chamada da classe salva. Deus abençoe!" };
  } catch (err) {
    return toActionError(err);
  }
}

export async function registrarContatoEbdAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await (await getEbdService()).registrarContato(await ator(), {
      membroId: texto(formData, "membroId"),
      classeId: texto(formData, "classeId"),
      data: texto(formData, "data"),
      resultado: texto(formData, "resultado"),
      observacao: texto(formData, "observacao"),
    });
    revalidar();
    return { success: "Contato registrado." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function salvarFaltasAlertaEbdAction(faltas: number): Promise<ActionState> {
  try {
    await (await getEbdService()).salvarFaltasAlerta(await ator(), faltas);
    revalidar();
    return { success: "Regra salva." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function salvarTrimestreAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const id = texto(formData, "id") || null;
    await (await getEbdService()).salvarTrimestre(await ator(), id, {
      nome: texto(formData, "nome"),
      inicio: texto(formData, "inicio"),
      fim: texto(formData, "fim"),
      revista: texto(formData, "revista"),
    });
    revalidar();
    return { success: id ? "Trimestre atualizado." : "Trimestre criado." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function removerTrimestreAction(id: string): Promise<ActionState> {
  try {
    await (await getEbdService()).removerTrimestre(await ator(), id);
    revalidar();
    return { success: "Trimestre removido." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function salvarResponsavelAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await ator();
    const id = texto(formData, "id");
    await (await getEbdService()).salvarResponsavel({
      id,
      membroId: texto(formData, "membroId"),
      responsavelId: texto(formData, "responsavelId"),
      nome: texto(formData, "nome"),
      telefone: texto(formData, "telefone"),
      parentesco: texto(formData, "parentesco"),
      podeBuscar: formData.get("podeBuscar") === "on",
    });
    revalidar();
    return { success: id ? "Responsável atualizado." : "Responsável cadastrado." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function removerResponsavelAction(id: string): Promise<ActionState> {
  try {
    await ator();
    await (await getEbdService()).removerResponsavel(id);
    revalidar();
    return { success: "Responsável removido." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function salvarCuidadosAction(membroId: string, texto: string): Promise<ActionState> {
  try {
    await ator();
    await (await getEbdService()).salvarCuidados(membroId, texto);
    revalidar();
    return { success: "Cuidados salvos." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function promoverAction(input: {
  data: string;
  itens: Array<{ membroId: string; classeId: string }>;
}): Promise<ActionState> {
  try {
    const n = await (await getEbdService()).promover(await ator(), input);
    revalidar();
    return { success: n === 1 ? "1 aluno mudou de classe." : `${n} alunos mudaram de classe.` };
  } catch (err) {
    return toActionError(err);
  }
}

export async function gerarLicoesAction(trimestreId: string): Promise<ActionState> {
  try {
    const n = await (await getEbdService()).gerarLicoes(await ator(), trimestreId);
    revalidar();
    return { success: n === 0 ? "As lições já estavam todas criadas." : `${n} lições criadas, uma por domingo.` };
  } catch (err) {
    return toActionError(err);
  }
}

export async function salvarTituloLicaoAction(
  licaoId: string,
  titulo: string,
  classeId: string | null = null,
): Promise<ActionState> {
  try {
    await (await getEbdService()).salvarTituloLicao(await ator(), licaoId, titulo, classeId);
    revalidar();
    return { success: "Lição salva." };
  } catch (err) {
    return toActionError(err);
  }
}
