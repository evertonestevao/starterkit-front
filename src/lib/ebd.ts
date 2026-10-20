import { diaDaSemana, somarDias } from "./acompanhamento";
import { saudar } from "@/lib/saudacao";
import type { EbdClasse, EbdLicao, EbdResumoClasse, EbdTrimestre } from "@/types/ebd";

/**
 * Regras puras da EBD (sem I/O).
 */

/** Hoje, se for domingo; senão o último domingo (chamada feita depois é comum). */
export function domingoSugerido(hoje: string): string {
  return somarDias(hoje, -diaDaSemana(hoje));
}

/** "R$ 12,50" a partir de centavos. */
export function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Valor digitado ("12,50", "12.50", "R$ 1.234,56", "10") para centavos.
 * Vazio = 0; texto inválido = null.
 */
export function centavosDe(texto: string): number | null {
  const limpo = texto.replace(/[R$\s]/g, "");
  if (limpo === "") return 0;
  // "1.234,56" -> "1234.56"; "12,5" -> "12.5"; "12.50" fica.
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  return Math.round(Number(normal) * 100);
}

/** Totais do domingo, somando as classes. */
export function totaisDoDia(linhas: EbdResumoClasse[]) {
  return linhas.reduce(
    (t, l) => ({
      matriculados: t.matriculados + l.matriculados,
      presentes: t.presentes + l.presentes,
      ausentes: t.ausentes + l.ausentes,
      justificados: t.justificados + l.justificados,
      visitantes: t.visitantes + l.visitantes,
      biblias: t.biblias + l.biblias,
      revistas: t.revistas + l.revistas,
      ofertaCentavos: t.ofertaCentavos + l.ofertaCentavos,
      classesComChamada: t.classesComChamada + (l.chamadaFeita ? 1 : 0),
    }),
    {
      matriculados: 0,
      presentes: 0,
      ausentes: 0,
      justificados: 0,
      visitantes: 0,
      biblias: 0,
      revistas: 0,
      ofertaCentavos: 0,
      classesComChamada: 0,
    },
  );
}

/** Idade em anos completos numa data (para mostrar ao lado do aluno). */
export function idadeEm(nascimento: string | null, data: string): number | null {
  if (!nascimento) return null;
  const [an, mn, dn] = nascimento.split("-").map(Number);
  const [a, m, d] = data.split("-").map(Number);
  let idade = a - an;
  if (m < mn || (m === mn && d < dn)) idade--;
  return idade >= 0 ? idade : null;
}

/** O trimestre que contém a data (o mais recente, se houver sobreposição). */
export function trimestreDe(trimestres: EbdTrimestre[], data: string): EbdTrimestre | null {
  return (
    [...trimestres]
      .filter((t) => t.inicio <= data && data <= t.fim)
      .sort((a, b) => b.inicio.localeCompare(a.inicio))[0] ?? null
  );
}

/**
 * Sugestão para o próximo trimestre: o trimestre do calendário seguinte ao
 * último cadastrado (ou o atual, se não houver nenhum).
 */
export function proximoTrimestre(
  trimestres: Pick<EbdTrimestre, "fim">[],
  hoje: string,
): { nome: string; inicio: string; fim: string } {
  const base = trimestres.length > 0 ? somarDias([...trimestres].sort((a, b) => b.fim.localeCompare(a.fim))[0].fim, 1) : hoje;
  const [ano, mes] = base.split("-").map(Number);
  const q = Math.floor((mes - 1) / 3); // 0..3
  const inicioMes = q * 3 + 1;
  const fimMes = inicioMes + 2;
  const ultimoDia = new Date(Date.UTC(ano, fimMes, 0)).getUTCDate();
  const dois = (n: number) => String(n).padStart(2, "0");
  return {
    nome: `${q + 1}º trimestre de ${ano}`,
    inicio: `${ano}-${dois(inicioMes)}-01`,
    fim: `${ano}-${dois(fimMes)}-${dois(ultimoDia)}`,
  };
}

/** Mensagem acolhedora do alerta da EBD; para criança, fala com a família. */
export function mensagemSaudadeEbd(
  nome: string,
  classe: string,
  igreja: string,
  crianca: boolean,
  saudacao?: string | null,
): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? nome;
  if (crianca) {
    return (
      `${saudar(saudacao)} Aqui é da Escola Bíblica da ${igreja}. ` +
      `Sentimos falta do(a) ${primeiro} na classe ${classe} nos últimos domingos. ` +
      `Está tudo bem com vocês? Esperamos vocês no próximo domingo!`
    );
  }
  return (
    `${saudar(saudacao, nome)} Aqui é da Escola Bíblica da ${igreja}. ` +
    `Sentimos sua falta na classe ${classe} nos últimos domingos. ` +
    `Está tudo bem? Esperamos você no próximo domingo!`
  );
}

/**
 * Classe sugerida para a idade (anos completos na data). Entre as classes
 * ativas com faixa de idade, a que contém a idade; se mais de uma, a de faixa
 * mais estreita. Sem nascimento ou sem classe que sirva: null (fica onde está).
 */
export function sugerirClassePorIdade(
  classes: Pick<EbdClasse, "id" | "ativa" | "idadeMinima" | "idadeMaxima">[],
  nascimento: string | null,
  data: string,
): string | null {
  const idade = idadeEm(nascimento, data);
  if (idade === null) return null;
  const cabe = classes.filter(
    (c) =>
      c.ativa &&
      (c.idadeMinima !== null || c.idadeMaxima !== null) &&
      (c.idadeMinima === null || idade >= c.idadeMinima) &&
      (c.idadeMaxima === null || idade <= c.idadeMaxima),
  );
  const largura = (c: (typeof cabe)[number]) => (c.idadeMaxima ?? 200) - (c.idadeMinima ?? 0);
  return cabe.sort((a, b) => largura(a) - largura(b))[0]?.id ?? null;
}

/** Os domingos entre duas datas (inclusive). */
export function domingosEntre(inicio: string, fim: string): string[] {
  const primeiro = somarDias(inicio, (7 - diaDaSemana(inicio)) % 7);
  const lista: string[] = [];
  for (let d = primeiro; d <= fim; d = somarDias(d, 7)) lista.push(d);
  return lista;
}

/** "Lição 3 — A fé de Abraão" (ou só "Lição 3"), para a chamada. */
export function textoDaLicao(licao: Pick<EbdLicao, "numero" | "titulo">): string {
  return licao.titulo ? `Lição ${licao.numero} — ${licao.titulo}` : `Lição ${licao.numero}`;
}

/** Parentescos sugeridos no cadastro de responsável. */
export const PARENTESCOS = ["Mãe", "Pai", "Avó", "Avô", "Tia", "Tio", "Irmã", "Irmão", "Madrinha", "Padrinho", "Outro"];

/** Faixa da frequência do aluno: acima de 70% é alta, de 40% a 70% média, abaixo de 40% baixa. */
export type FaixaFrequencia = "alta" | "media" | "baixa" | "sem";

export function faixaDeFrequencia(percentual: number | null | undefined): FaixaFrequencia {
  if (percentual === null || percentual === undefined) return "sem";
  if (percentual > 70) return "alta";
  if (percentual >= 40) return "media";
  return "baixa";
}

/** Ofertas do período no relatório da EBD: total, média por domingo e a parte de cada classe. */
export interface ValoresDoPeriodo {
  totalCentavos: number;
  /** Total ÷ domingos com chamada; null sem nenhum domingo. */
  mediaPorDomingoCentavos: number | null;
  domingos: number;
  biblias: number;
  revistas: number;
  /** Só as classes com aula no período, da maior oferta para a menor. */
  porClasse: Array<{ classeId: string; classeNome: string; centavos: number; aulas: number; percentual: number }>;
}

export function valoresDoPeriodo(
  classes: ReadonlyArray<{
    classeId: string;
    classeNome: string;
    aulas: number;
    ofertaCentavos: number;
    biblias: number;
    revistas: number;
  }>,
  domingosComChamada: number,
): ValoresDoPeriodo {
  const totalCentavos = classes.reduce((soma, c) => soma + c.ofertaCentavos, 0);
  return {
    totalCentavos,
    mediaPorDomingoCentavos: domingosComChamada > 0 ? Math.round(totalCentavos / domingosComChamada) : null,
    domingos: domingosComChamada,
    biblias: classes.reduce((soma, c) => soma + c.biblias, 0),
    revistas: classes.reduce((soma, c) => soma + c.revistas, 0),
    porClasse: classes
      .filter((c) => c.aulas > 0)
      .map((c) => ({
        classeId: c.classeId,
        classeNome: c.classeNome,
        centavos: c.ofertaCentavos,
        aulas: c.aulas,
        percentual: totalCentavos > 0 ? (100 * c.ofertaCentavos) / totalCentavos : 0,
      }))
      .sort((a, b) => b.centavos - a.centavos || a.classeNome.localeCompare(b.classeNome, "pt-BR")),
  };
}
