import { formatarData } from "@/lib/acompanhamento";

/**
 * Mensalidade pendente: o aviso no topo do painel (durante a tolerância) e a
 * mensagem de painel suspenso (depois dela). Regras puras, sem I/O: o que
 * dizer a partir do que o banco devolve.
 *
 * O tom é sempre educado. O aviso diz até quando dá para regularizar e o que
 * acontece depois; a suspensão explica o que houve, que nada foi apagado e
 * como reativar.
 */

export type MotivoPendencia = "fatura_vencida" | "sem_cadastro" | "cadastro_incompleto";

export interface MensalidadePendente {
  churchId: string;
  churchName: string;
  motivo: MotivoPendencia;
  /** AAAA-MM-DD: desde quando está pendente. */
  desde: string;
  /** AAAA-MM-DD: último dia da tolerância. */
  toleranciaAte: string;
}

export interface AvisoMensalidade {
  titulo: string;
  texto: string;
  /** O que o botão diz. */
  acao: string;
}

export interface BloqueioMensalidade {
  titulo: string;
  texto: string;
  /** O que o botão diz; `null` para quem não administra a igreja (não há o que ela possa fazer). */
  acao: string | null;
}

/** O único menu que sobra com o painel suspenso. */
export const MENU_MENSALIDADE = "mensalidade";

/** Dias entre duas datas AAAA-MM-DD (b - a), sem fuso. */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function oQueFalta(motivo: MotivoPendencia, desde: string): string {
  switch (motivo) {
    case "fatura_vencida":
      return `venceu em ${formatarData(desde)} e ainda não consta como paga`;
    case "sem_cadastro":
      return "ainda não tem uma forma de pagamento cadastrada";
    case "cadastro_incompleto":
      return "teve o cadastro do pagamento iniciado, mas não concluído";
  }
}

function sujeito(p: MensalidadePendente, variasIgrejas: boolean): string {
  return variasIgrejas ? `A mensalidade de ${p.churchName}` : "A mensalidade da igreja";
}

/**
 * O aviso para uma igreja, enquanto a tolerância corre; `null` depois dela
 * (aí quem fala é `montarBloqueio`). `variasIgrejas` põe o nome dela no texto
 * (conta com mais de uma igreja); com uma só, "a mensalidade" basta.
 */
export function montarAviso(p: MensalidadePendente, hoje: string, variasIgrejas = false): AvisoMensalidade | null {
  const restam = diasEntre(hoje, p.toleranciaAte);
  if (restam < 0) return null;

  const prazo =
    restam === 0
      ? "Hoje é o último dia para regularizar"
      : restam === 1
        ? "Você tem até amanhã para regularizar"
        : `Você tem até ${formatarData(p.toleranciaAte)} para regularizar`;
  return {
    titulo: "Um lembrete sobre a mensalidade",
    texto: `${sujeito(p, variasIgrejas)} ${oQueFalta(p.motivo, p.desde)}. ${prazo}, e até lá nada muda no uso do sistema. Depois desse prazo, o acesso ao painel fica suspenso até o pagamento ser confirmado. Se já pagou, pode desconsiderar este aviso.`,
    acao: p.motivo === "fatura_vencida" ? "Ver a mensalidade" : "Cadastrar o pagamento",
  };
}

/**
 * A mensagem de painel suspenso. Quem administra a igreja lê o que aconteceu e
 * como reativar; os demais só ficam sabendo que há uma pendência a resolver
 * com o Responsável — sem o motivo, que é assunto de quem administra.
 * `p` pode faltar (a consulta do detalhe falhou): a mensagem fica genérica.
 */
export function montarBloqueio(
  p: MensalidadePendente | null,
  administra: boolean,
  variasIgrejas = false,
): BloqueioMensalidade {
  const titulo = "O acesso ao painel está suspenso";
  const nadaPerdido =
    "Nada foi apagado: assim que o pagamento for confirmado, o painel volta ao normal, do jeito que estava.";

  if (!administra) {
    return {
      titulo,
      texto:
        "O painel desta igreja está temporariamente suspenso por uma pendência administrativa. Nada foi apagado, e tudo volta ao normal assim que ela for resolvida. Por gentileza, procure o Responsável pela igreja.",
      acao: null,
    };
  }
  if (!p) {
    return {
      titulo,
      texto: `A mensalidade da igreja está pendente e o prazo para regularizar terminou. ${nadaPerdido}`,
      acao: "Ver a mensalidade",
    };
  }
  return {
    titulo,
    texto: `${sujeito(p, variasIgrejas)} ${oQueFalta(p.motivo, p.desde)}, e o prazo para regularizar terminou em ${formatarData(p.toleranciaAte)}. Por isso o painel foi suspenso. ${nadaPerdido}`,
    acao: p.motivo === "fatura_vencida" ? "Pagar e reativar" : "Cadastrar o pagamento e reativar",
  };
}

/**
 * Qual pendência mostrar quando há mais de uma: a de prazo mais apertado (o
 * banco já devolve da mais antiga para a mais nova).
 */
export function pendenciaPrincipal(lista: MensalidadePendente[]): MensalidadePendente | null {
  return [...lista].sort((a, b) => a.toleranciaAte.localeCompare(b.toleranciaAte))[0] ?? null;
}

/**
 * Menus de quem está numa igreja suspensa: só a mensalidade — e só para quem
 * já a tinha (quem administra). Os outros ficam sem menu nenhum.
 */
export function menusComBloqueio(menus: string[], bloqueada: boolean): string[] {
  return bloqueada ? menus.filter((m) => m === MENU_MENSALIDADE) : menus;
}
