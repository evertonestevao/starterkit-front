import { cultoAconteceEm, diaDaSemana, formatarData, linkWhatsapp, somarDias } from "@/lib/acompanhamento";
import { formatarReais } from "@/lib/ebd";
import { mensagemParabens, type ProximoAniversario } from "@/lib/rolMembros";
import type { Culto } from "@/types/acompanhamento";

/**
 * "Para hoje" no Painel: o que pede ação agora, cada item com o botão que leva
 * direto lá. Funções puras; o Painel junta os dados (só dos módulos que a
 * pessoa acessa) e a tela só desenha. Item que não pede nada não aparece.
 */

export type IconeDaTarefa = "chamada" | "ebd" | "alerta" | "visita" | "oracao" | "revista" | "aniversario" | "evento";

export interface TarefaDoDia {
  chave: string;
  icone: IconeDaTarefa;
  titulo: string;
  detalhe?: string;
  href: string;
  /** Texto do botão. */
  acao: string;
  /** Link para fora do sistema (WhatsApp): abre em outra aba. */
  externo?: boolean;
  /** Vem primeiro e com destaque (é para agora). */
  urgente?: boolean;
}

/** Uma chamada de culto já feita (do relatório do período). */
export interface ChamadaFeita {
  cultoId: string;
  data: string;
}

/** Até quantos dias depois do domingo a chamada da EBD pendente aparece. */
export const DIAS_DA_EBD_PENDENTE = 2;

const minutos = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
};
const horaCurta = (hora: string) => {
  const [h, m] = hora.split(":");
  return m && m !== "00" ? `${Number(h)}h${m}` : `${Number(h)}h`;
};
const NOMES_DOS_DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "hoje", "ontem" ou "quarta (08/10)". */
export function quandoFoi(data: string, hoje: string): string {
  if (data === hoje) return "hoje";
  if (data === somarDias(hoje, -1)) return "ontem";
  return `${NOMES_DOS_DIAS[diaDaSemana(data)]} (${formatarData(data).slice(0, 5)})`;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Chamadas de culto, só as de HOJE: culto que já começou sem chamada é
 * urgente; o que ainda vai começar aparece como lembrete. Chamada de culto
 * de outro dia não entra (decisão de 14/10: o Painel é do dia).
 */
export function tarefasDosCultos(
  cultos: readonly Culto[],
  feitas: readonly ChamadaFeita[],
  hoje: string,
  horaAgora: string,
): TarefaDoDia[] {
  const feita = new Set(feitas.map((f) => `${f.cultoId}|${f.data}`));
  const agora = minutos(horaAgora);
  const deHoje = cultos
    .filter((c) => c.registraChamada && !c.removido && cultoAconteceEm(c, hoje) && !feita.has(`${c.id}|${hoje}`))
    // O que já começou, do mais recente; depois os que vêm, na ordem do horário.
    .sort((a, b) => {
      const ja = (c: Culto) => minutos(c.hora) <= agora;
      if (ja(a) !== ja(b)) return ja(a) ? -1 : 1;
      return ja(a) ? minutos(b.hora) - minutos(a.hora) : minutos(a.hora) - minutos(b.hora);
    });

  return deHoje.map((culto) => {
    const href = `/dashboard/acompanhamento/chamada/${culto.id}?data=${hoje}`;
    if (minutos(culto.hora) <= agora) {
      return {
        chave: `culto-${culto.id}-${hoje}`,
        icone: "chamada",
        titulo: `Chamada do culto de hoje: ${culto.nome} (${horaCurta(culto.hora)})`,
        detalhe: "O culto já começou: marque quem veio.",
        href,
        acao: "Fazer chamada",
        urgente: true,
      };
    }
    return {
      chave: `culto-${culto.id}-${hoje}-depois`,
      icone: "chamada",
      titulo: `Hoje às ${horaCurta(culto.hora)}: ${culto.nome}`,
      detalhe: "A chamada fica aqui quando o culto começar.",
      href,
      acao: "Abrir chamada",
    };
  });
}

export interface ClasseDoDomingo {
  classeId: string;
  classeNome: string;
  matriculados: number;
  chamadaFeita: boolean;
}

/** EBD: classes com alunos e sem chamada no último domingo (até 2 dias depois). */
export function tarefaDaEbd(domingo: string, hoje: string, classes: readonly ClasseDoDomingo[]): TarefaDoDia | null {
  if (domingo > hoje || somarDias(domingo, DIAS_DA_EBD_PENDENTE) < hoje) return null;
  const sem = classes.filter((c) => c.matriculados > 0 && !c.chamadaFeita);
  if (sem.length === 0) return null;
  const ehHoje = domingo === hoje;
  const unica = sem.length === 1 ? sem[0] : null;
  return {
    chave: `ebd-${domingo}`,
    icone: "ebd",
    titulo: unica
      ? `Chamada da EBD de ${quandoFoi(domingo, hoje)}: ${unica.classeNome}`
      : `Chamada da EBD de ${quandoFoi(domingo, hoje)}: ${sem.length} classes sem chamada`,
    detalhe: unica ? undefined : sem.map((c) => c.classeNome).join(", "),
    href: unica ? `/dashboard/ebd/classes/${unica.classeId}/chamada?data=${domingo}` : `/dashboard/ebd`,
    acao: unica ? "Fazer chamada" : "Ver classes",
    urgente: ehHoje,
  };
}

export interface RevistasPendentes {
  trimestreId: string;
  trimestreNome: string;
  /** O trimestre já começou (antes disso, "a entregar" é o normal: a revista nem chegou). */
  comecou: boolean;
  devendo: number;
  aReceberCentavos: number;
  aEntregar: number;
}

export interface DadosParaHoje {
  hoje: string;
  horaAgora: string;
  cultos?: { lista: readonly Culto[]; feitas: readonly ChamadaFeita[] } | null;
  ebd?: { domingo: string; classes: readonly ClasseDoDomingo[] } | null;
  /** Membros com faltas seguidas nos cultos. */
  emAlerta?: number | null;
  /** Alunos com faltas seguidas na EBD. */
  ebdEmAlerta?: number | null;
  visitasSemContato?: number | null;
  oracoesNovas?: number | null;
  revistas?: RevistasPendentes | null;
  aniversarios?: { itens: readonly ProximoAniversario[]; igreja: string; saudacao: string } | null;
  eventos?: ReadonlyArray<{ id: string; titulo: string; inicio: string; inscritos: number; diaInicio: string }> | null;
}

/** A lista do dia, na ordem em que vale a pena resolver: o urgente primeiro. */
export function montarParaHoje(d: DadosParaHoje): TarefaDoDia[] {
  const tarefas: TarefaDoDia[] = [];

  if (d.cultos) tarefas.push(...tarefasDosCultos(d.cultos.lista, d.cultos.feitas, d.hoje, d.horaAgora));
  if (d.ebd) {
    const ebd = tarefaDaEbd(d.ebd.domingo, d.hoje, d.ebd.classes);
    if (ebd) tarefas.push(ebd);
  }
  if (d.emAlerta) {
    tarefas.push({
      chave: "alerta-cultos",
      icone: "alerta",
      titulo: `${plural(d.emAlerta, "pessoa", "pessoas")} com faltas seguidas nos cultos`,
      detalhe: "Um contato agora ajuda a não perder ninguém.",
      href: "/dashboard/acompanhamento/alertas",
      acao: "Ver quem",
    });
  }
  if (d.ebdEmAlerta) {
    tarefas.push({
      chave: "alerta-ebd",
      icone: "alerta",
      titulo: `${plural(d.ebdEmAlerta, "aluno", "alunos")} da EBD com faltas seguidas`,
      href: "/dashboard/ebd/alertas",
      acao: "Ver quem",
    });
  }
  if (d.visitasSemContato) {
    tarefas.push({
      chave: "visitas",
      icone: "visita",
      titulo: `${plural(d.visitasSemContato, "pedido", "pedidos")} de visita sem contato`,
      detalhe: "Pediram pela página da igreja.",
      href: "/dashboard/relationships",
      acao: "Abrir",
    });
  }
  if (d.oracoesNovas) {
    tarefas.push({
      chave: "oracao",
      icone: "oracao",
      titulo: `${plural(d.oracoesNovas, "pedido", "pedidos")} de oração novos`,
      detalhe: "Desde a sua última visita.",
      href: "/dashboard/prayers",
      acao: "Ler",
    });
  }
  if (d.revistas) {
    const r = d.revistas;
    const partes = [
      r.devendo > 0
        ? `${plural(r.devendo, "pedido", "pedidos")} com pagamento pendente (${formatarReais(r.aReceberCentavos)})`
        : null,
      r.comecou && r.aEntregar > 0 ? `${plural(r.aEntregar, "pedido", "pedidos")} a entregar` : null,
    ].filter((p): p is string => p !== null);
    if (partes.length > 0) {
      tarefas.push({
        chave: `revistas-${r.trimestreId}`,
        icone: "revista",
        titulo: `Revistas da EBD · ${r.trimestreNome}`,
        detalhe: partes.join(" · "),
        href: `/dashboard/ebd/revistas?trimestre=${r.trimestreId}`,
        acao: "Ver pedidos",
      });
    }
  }
  if (d.aniversarios) {
    for (const a of d.aniversarios.itens.filter((x) => x.emDias === 0)) {
      const zap = linkWhatsapp(a.whatsapp, mensagemParabens(a, d.aniversarios.igreja, d.aniversarios.saudacao));
      const motivo =
        a.tipo === "casamento"
          ? "aniversário de casamento"
          : a.tipo === "batismo"
            ? "aniversário de batismo"
            : "aniversário";
      tarefas.push({
        chave: `aniversario-${a.tipo}-${a.membroId}`,
        icone: "aniversario",
        titulo: `Hoje é ${motivo} de ${a.nome}`,
        detalhe: zap ? undefined : "Sem WhatsApp no cadastro.",
        href: zap ?? `/dashboard/membros/${a.membroId}`,
        acao: zap ? "Mandar parabéns" : "Ver cadastro",
        externo: Boolean(zap),
      });
    }
  }
  if (d.eventos) {
    for (const e of d.eventos.filter((x) => x.diaInicio === d.hoje)) {
      tarefas.push({
        chave: `evento-${e.id}`,
        icone: "evento",
        titulo: `Hoje: ${e.titulo}`,
        detalhe: plural(e.inscritos, "inscrito", "inscritos"),
        href: "/dashboard/events",
        acao: "Ver inscritos",
      });
    }
  }

  // Estável: o urgente sobe, o resto mantém a ordem acima.
  return [...tarefas.filter((t) => t.urgente), ...tarefas.filter((t) => !t.urgente)];
}
