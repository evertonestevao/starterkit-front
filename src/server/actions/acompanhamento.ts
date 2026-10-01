"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { getAcompanhamentoActor, getAcompanhamentoService } from "@/server/acompanhamento";
import type { AcompanhamentoActor } from "@/services/acompanhamentoService";
import type { ConfigAcompanhamento, Visitante } from "@/types/acompanhamento";
import { convidarParaSistema } from "@/server/conviteSistema";
import { toActionError, type ActionState } from "./action-state";

const BASE = "/dashboard/acompanhamento";

async function ator(): Promise<AcompanhamentoActor> {
  const actor = await getAcompanhamentoActor();
  if (!actor) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  return actor;
}

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "");
}

function revalidar() {
  revalidatePath(BASE, "layout");
  revalidatePath("/dashboard/membros", "layout");
  revalidatePath("/dashboard");
}

export async function salvarMembroAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const id = texto(formData, "id") || null;
    const actor = await ator();
    await (await getAcompanhamentoService()).salvarMembro(
      actor,
      id,
      {
        nome: texto(formData, "nome"),
        whatsapp: texto(formData, "whatsapp"),
        email: texto(formData, "email"),
        // Campo escondido "participaEnviado" diz que a caixa existia no form.
        participaChamada: formData.get("participaEnviado") ? formData.get("participaChamada") === "on" : true,
        membroIgreja: formData.get("participaEnviado") ? formData.get("membroIgreja") === "on" : true,
        nascimento: texto(formData, "nascimento"),
        batismo: texto(formData, "batismo"),
        ativo: formData.get("ativo") === "on",
        observacoes: texto(formData, "observacoes"),
      },
      // Caixas desmarcadas não vão no form: o campo escondido diz que a
      // lista de cargos veio (mesmo vazia = tirar todos).
      formData.get("cargosEnviados") ? formData.getAll("cargoIds").map(String) : undefined,
    );
    const salvo = id ? "Membro atualizado." : "Membro cadastrado.";

    // "Convidar para acessar o sistema" marcado: o membro já está salvo; se o
    // convite falhar, a mensagem diz isso sem desfazer o cadastro.
    const convidarComo = texto(formData, "convidarComo");
    const email = texto(formData, "email").trim().toLowerCase();
    if ((convidarComo === "member" || convidarComo === "admin") && email) {
      try {
        await convidarParaSistema({ companyId: actor.companyId, email, role: convidarComo });
      } catch (err) {
        revalidar();
        const motivo = toActionError(err).error ?? "erro desconhecido";
        return { error: `${salvo.slice(0, -1)}, mas o convite não foi enviado: ${motivo}` };
      }
      revalidar();
      return { success: `${salvo.slice(0, -1)} e convite enviado para ${email}.` };
    }

    revalidar();
    return { success: salvo };
  } catch (err) {
    return toActionError(err);
  }
}

/** Chamada fora de <form> (a tela monta a lista em memória e envia de uma vez). */
export async function salvarChamadaAction(input: {
  cultoId: string;
  data: string;
  presencas: Array<{
    membroId: string;
    estado: string;
    justificativaId: string | null;
    motivo: string | null;
    motivoTexto: string | null;
  }>;
  visitantes: Visitante[];
}): Promise<ActionState> {
  try {
    await (await getAcompanhamentoService()).salvarChamada(await ator(), input);
    revalidar();
    return { success: "Chamada salva. Deus abençoe!" };
  } catch (err) {
    return toActionError(err);
  }
}

export async function salvarJustificativaAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const id = texto(formData, "id") || null;
    const inicio = texto(formData, "dataInicio");
    await (await getAcompanhamentoService()).salvarJustificativa(await ator(), id, {
      membroId: texto(formData, "membroId"),
      motivo: texto(formData, "motivo"),
      motivoTexto: texto(formData, "motivoTexto"),
      dataInicio: inicio,
      // Um culto só: a data final pode ficar em branco.
      dataFim: texto(formData, "dataFim") || inicio,
    });
    revalidar();
    return { success: id ? "Justificativa atualizada." : "Justificativa registrada." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function encerrarJustificativaAction(id: string): Promise<ActionState> {
  try {
    await (await getAcompanhamentoService()).encerrarJustificativa(await ator(), id);
    revalidar();
    return { success: "Justificativa encerrada." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function registrarContatoAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await (await getAcompanhamentoService()).registrarContato(await ator(), {
      membroId: texto(formData, "membroId"),
      motivo: texto(formData, "motivo"),
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

export async function salvarConfigAction(config: ConfigAcompanhamento): Promise<ActionState> {
  try {
    await (await getAcompanhamentoService()).salvarConfig(await ator(), config);
    revalidar();
    return { success: "Regras salvas." };
  } catch (err) {
    return toActionError(err);
  }
}
