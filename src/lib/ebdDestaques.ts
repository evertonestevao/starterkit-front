import { percentualPresenca } from "./acompanhamento";
import type { EbdFrequenciaAluno, EbdPresencaDomingo, EbdRelatorioClasse, EbdTrimestre } from "@/types/ebd";

/**
 * Destaques da EBD: o trimestre mostrado e os rankings que a tela traz. Lógica pura, sem I/O.
 */

/** O trimestre mostrado e o anterior a ele, para comparar. */
export interface PeriodoDestaque {
  /** Id do trimestre cadastrado; null quando a igreja não cadastrou (trimestre do calendário). */
  id: string | null;
  nome: string;
  de: string;
  ate: string;
  revista: string | null;
  anterior: { nome: string; de: string; ate: string };
}

type TrimestreCadastrado = Pick<EbdTrimestre, "id" | "nome" | "inicio" | "fim" | "revista">;

const iso = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

/** Trimestre do calendário (jan-mar, abr-jun...) que contém a data. */
function trimestreDoCalendario(data: string) {
  const ano = Number(data.slice(0, 4));
  const n = Math.ceil(Number(data.slice(5, 7)) / 3);
  const inicio = (n - 1) * 3 + 1;
  const ultimoDia = new Date(Date.UTC(ano, inicio + 2, 0)).getUTCDate();
  return { nome: `${n}º trimestre de ${ano}`, de: iso(ano, inicio, 1), ate: iso(ano, inicio + 2, ultimoDia) };
}

/** O trimestre do calendário logo antes da data. */
function calendarioAnterior(data: string) {
  const ano = Number(data.slice(0, 4));
  const n = Math.ceil(Number(data.slice(5, 7)) / 3);
  return trimestreDoCalendario(n === 1 ? iso(ano - 1, 12, 1) : iso(ano, (n - 2) * 3 + 1, 1));
}

/** Trimestres cadastrados, do mais recente para o mais antigo (ordem do seletor). */
export function trimestresRecentes<T extends { inicio: string }>(trimestres: T[]): T[] {
  return [...trimestres].sort((x, y) => y.inicio.localeCompare(x.inicio));
}

/**
 * A EBD anda por trimestre. O período dos destaques é: o trimestre pedido
 * (id) > o que contém a data de referência > o mais recente já começado. A
 * comparação é com o trimestre cadastrado imediatamente antes; sem ele (ou
 * sem cadastro nenhum), com o trimestre do calendário anterior.
 */
export function periodoDestaque(
  trimestres: TrimestreCadastrado[],
  idPedido: string | undefined,
  referencia: string,
): PeriodoDestaque {
  const recentes = trimestresRecentes(trimestres);
  const escolhido =
    recentes.find((t) => t.id === idPedido) ??
    recentes.find((t) => t.inicio <= referencia && referencia <= t.fim) ??
    recentes.find((t) => t.inicio <= referencia) ??
    null;

  if (!escolhido) {
    const cal = trimestreDoCalendario(referencia);
    return { id: null, ...cal, revista: null, anterior: calendarioAnterior(cal.de) };
  }
  const antes = recentes.find((t) => t.fim < escolhido.inicio);
  return {
    id: escolhido.id,
    nome: escolhido.nome,
    de: escolhido.inicio,
    ate: escolhido.fim,
    revista: escolhido.revista,
    anterior: antes ? { nome: antes.nome, de: antes.inicio, ate: antes.fim } : calendarioAnterior(escolhido.inicio),
  };
}

/** Números gerais do período (todas as classes somadas). */
export interface TotaisPeriodo {
  /** Domingos com pelo menos uma chamada. */
  domingos: number;
  presentes: number;
  ausentes: number;
  /** % sobre presentes + ausentes; null = sem chamada. */
  presenca: number | null;
  /** Presentes por domingo com chamada; null = sem chamada. */
  mediaPresentes: number | null;
  visitantes: number;
  ofertaCentavos: number;
}

export function totaisDoPeriodo(classes: EbdRelatorioClasse[], domingos: EbdPresencaDomingo[]): TotaisPeriodo {
  const presentes = domingos.reduce((s, d) => s + d.presentes, 0);
  const ausentes = domingos.reduce((s, d) => s + d.ausentes, 0);
  return {
    domingos: domingos.length,
    presentes,
    ausentes,
    presenca: percentualPresenca(presentes, ausentes),
    mediaPresentes: domingos.length > 0 ? Math.round((presentes / domingos.length) * 10) / 10 : null,
    visitantes: domingos.reduce((s, d) => s + d.visitantes, 0),
    ofertaCentavos: classes.reduce((s, c) => s + c.ofertaCentavos, 0),
  };
}

/**
 * Posição de cada valor numa lista já ordenada do maior para o menor.
 * Empatados dividem a posição e a próxima segue em sequência, sem pular:
 * [90, 80, 80, 70] → [1, 2, 2, 3]. Sem isso, o desempate (alfabético)
 * viraria uma classificação que não existe.
 */
export function posicoesComEmpate(valores: number[]): number[] {
  let posicao = 0;
  return valores.map((v, i) => {
    if (i === 0 || v !== valores[i - 1]) posicao += 1;
    return posicao;
  });
}

export interface ClasseNoRanking {
  /** Posição no ranking de presença; classes empatadas dividem a mesma. */
  posicao: number;
  classeId: string;
  nome: string;
  aulas: number;
  /** % de presença no período; null = sem chamada. */
  presenca: number | null;
  /** Presentes por aula. */
  mediaPresentes: number | null;
  visitantes: number;
  ofertaCentavos: number;
}

/** Classes com aula no período, da maior presença para a menor (empate: mais aulas, depois nome). */
export function rankingDeClasses(classes: EbdRelatorioClasse[]): ClasseNoRanking[] {
  const ordenadas = classes
    .filter((c) => c.aulas > 0)
    .map((c) => ({
      classeId: c.classeId,
      nome: c.classeNome,
      aulas: c.aulas,
      presenca: percentualPresenca(c.presentes, c.ausentes),
      mediaPresentes: Math.round((c.presentes / c.aulas) * 10) / 10,
      visitantes: c.visitantes,
      ofertaCentavos: c.ofertaCentavos,
    }))
    .sort(
      (a, b) =>
        (b.presenca ?? -1) - (a.presenca ?? -1) || b.aulas - a.aulas || a.nome.localeCompare(b.nome, "pt-BR"),
    );
  const posicoes = posicoesComEmpate(ordenadas.map((c) => c.presenca ?? -1));
  return ordenadas.map((c, i) => ({ ...c, posicao: posicoes[i] }));
}

/** A classe que lidera um critério; null se ninguém pontuou (tudo zero). */
export function liderEm(ranking: ClasseNoRanking[], valor: (c: ClasseNoRanking) => number | null): ClasseNoRanking | null {
  let melhor: ClasseNoRanking | null = null;
  for (const c of ranking) {
    const v = valor(c) ?? 0;
    if (v > 0 && (melhor === null || v > (valor(melhor) ?? 0))) melhor = c;
  }
  return melhor;
}

/**
 * Mínimo de chamadas (presente ou ausente) para o aluno entrar no ranking:
 * metade do máximo que alguém teve no período, e nunca menos de 3. Sem isso,
 * quem veio a uma aula só apareceria com 100% à frente de quem veio sempre.
 */
export function minimoDeChamadas(alunos: EbdFrequenciaAluno[]): number {
  const maximo = Math.max(0, ...alunos.map((a) => a.presentes + a.ausentes));
  return Math.max(3, Math.ceil(maximo / 2));
}

export interface AlunoNoPodio {
  membroId: string;
  nome: string;
  classeNome: string;
  presentes: number;
  ausentes: number;
}

/** Uma colocação do pódio, com todos os alunos empatados nela. */
export interface LugarNoPodio {
  posicao: number;
  percentual: number;
  alunos: AlunoNoPodio[];
}

/**
 * Pódio dos mais assíduos: as primeiras colocações (1º, 2º e 3º), cada uma
 * com TODOS os alunos empatados naquele percentual — sem corte no meio de um
 * empate. Só o lado positivo: quem falta fica na tela de alertas.
 *
 * Um aluno em duas classes no período conta uma vez, pela melhor marca.
 * Dentro do lugar, a ordem é só de exibição: mais presenças, depois nome.
 */
export function podioDeAlunos(
  alunos: EbdFrequenciaAluno[],
  colocacoes = 3,
): { lugares: LugarNoPodio[]; minimo: number; elegiveis: number } {
  const minimo = minimoDeChamadas(alunos);
  const ordenados = alunos
    .filter((a) => a.percentual !== null && a.presentes + a.ausentes >= minimo)
    .sort(
      (a, b) =>
        (b.percentual as number) - (a.percentual as number) ||
        b.presentes - a.presentes ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
  const vistos = new Set<string>();
  const unicos = ordenados.filter((a) => (vistos.has(a.membroId) ? false : (vistos.add(a.membroId), true)));
  const posicoes = posicoesComEmpate(unicos.map((a) => a.percentual as number));

  const lugares: LugarNoPodio[] = [];
  unicos.forEach((a, i) => {
    if (posicoes[i] > colocacoes) return;
    let lugar = lugares[posicoes[i] - 1];
    if (!lugar) {
      lugar = { posicao: posicoes[i], percentual: a.percentual as number, alunos: [] };
      lugares.push(lugar);
    }
    lugar.alunos.push({
      membroId: a.membroId,
      nome: a.nome,
      classeNome: a.classeNome,
      presentes: a.presentes,
      ausentes: a.ausentes,
    });
  });
  return { lugares, minimo, elegiveis: unicos.length };
}

/** Diferença para o período anterior, em pontos; null se algum lado não tem dado. */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null) return null;
  return Math.round((atual - anterior) * 10) / 10;
}
