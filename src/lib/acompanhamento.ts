import type {
  Culto,
  EstadoPresenca,
  Justificativa,
  MotivoJustificativa,
  Presenca,
  ResultadoContato,
  SugestaoChamada,
} from "@/types/acompanhamento";

/**
 * Regras puras do acompanhamento (sem I/O). O cálculo "oficial" de faltas
 * seguidas roda no banco (acompanhamento_alertas); `contarFaltasSeguidas`
 * é a mesma regra em TS, usada no histórico do membro e coberta por teste
 * para servir de especificação.
 */

export const MOTIVO_LABEL: Record<MotivoJustificativa, string> = {
  viagem: "Viagem",
  saude: "Saúde",
  trabalho: "Trabalho",
  outro: "Outro",
};

export const MOTIVOS = Object.keys(MOTIVO_LABEL) as MotivoJustificativa[];

export const RESULTADO_LABEL: Record<ResultadoContato, string> = {
  retornou: "Retornou",
  em_acompanhamento: "Em acompanhamento",
  mudou_de_cidade: "Mudou de cidade",
  outro: "Outro",
};

export const RESULTADOS = Object.keys(RESULTADO_LABEL) as ResultadoContato[];

export const ESTADO_LABEL: Record<EstadoPresenca, string> = {
  presente: "Presente",
  ausente: "Ausente",
  justificado: "Justificado",
};

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/**
 * Faltas seguidas, olhando do culto mais recente para trás:
 * ausente soma 1, justificado é neutro (não soma e não zera), presente zera.
 * Recebe os estados em ordem cronológica (mais antigo primeiro).
 */
export function contarFaltasSeguidas(estados: EstadoPresenca[]): number {
  let faltas = 0;
  for (let i = estados.length - 1; i >= 0; i--) {
    if (estados[i] === "presente") break;
    if (estados[i] === "ausente") faltas++;
  }
  return faltas;
}

/** Cultos justificados em sequência no fim (qualquer presença ou falta interrompe). */
export function contarJustificadosSeguidos(estados: EstadoPresenca[]): number {
  let n = 0;
  for (let i = estados.length - 1; i >= 0 && estados[i] === "justificado"; i--) n++;
  return n;
}

/** % de presença sobre os cultos sem justificativa; null quando não houve nenhum. */
export function percentualPresenca(presentes: number, ausentes: number): number | null {
  const base = presentes + ausentes;
  if (base === 0) return null;
  return Math.round((presentes / base) * 1000) / 10;
}

/** "77,2%" (vírgula, como no Brasil); "—" quando não há base. */
export function formatarPercentual(valor: number | null): string {
  return valor === null ? "—" : `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** A justificativa (ativa, não removida) que cobre a data, se houver. */
export function justificativaDoDia(
  justificativas: Justificativa[],
  membroId: string,
  data: string,
): Justificativa | undefined {
  return justificativas.find((j) => j.membroId === membroId && j.dataInicio <= data && data <= j.dataFim);
}

/**
 * Estado inicial de cada membro na tela de chamada:
 * - chamada já feita: o que foi salvo (ausência coberta por justificativa
 *   posterior aparece como justificado, igual ao cálculo do banco);
 * - chamada nova: justificado se há justificativa para a data, senão presente
 *   (o mais comum; quem faltou é que recebe o toque).
 */
export function estadosIniciais(input: {
  membroIds: string[];
  data: string;
  presencas: Presenca[];
  justificativas: Justificativa[];
  chamadaExiste: boolean;
}): Record<string, EstadoPresenca> {
  const salvo = new Map(input.presencas.map((p) => [p.membroId, p.estado]));
  const estados: Record<string, EstadoPresenca> = {};
  for (const id of input.membroIds) {
    const justificado = Boolean(justificativaDoDia(input.justificativas, id, input.data));
    const anterior = salvo.get(id);
    if (anterior) {
      estados[id] = anterior === "ausente" && justificado ? "justificado" : anterior;
    } else if (justificado) {
      estados[id] = "justificado";
    } else {
      estados[id] = input.chamadaExiste ? "ausente" : "presente";
    }
  }
  return estados;
}

/** Um toque troca o estado: presente → ausente → justificado → presente. */
export function proximoEstado(estado: EstadoPresenca): EstadoPresenca {
  if (estado === "presente") return "ausente";
  if (estado === "ausente") return "justificado";
  return "presente";
}

export function contarEstados(estados: Record<string, EstadoPresenca>) {
  const total = { presente: 0, ausente: 0, justificado: 0 };
  for (const e of Object.values(estados)) total[e]++;
  return total;
}

/** Só dígitos, com DDI 55 quando o número parece brasileiro sem DDI. */
export function telefoneInternacional(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  if (digitos.length <= 11) return `55${digitos}`;
  return digitos;
}

export function linkWhatsapp(telefone: string | null, mensagem: string): string | null {
  if (!telefone) return null;
  const numero = telefoneInternacional(telefone);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

export function linkLigar(telefone: string | null): string | null {
  if (!telefone) return null;
  const digitos = telefone.replace(/\D/g, "");
  return digitos.length >= 8 ? `tel:${digitos}` : null;
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/** Mensagem acolhedora pronta (a tela deixa editar antes de abrir o WhatsApp). */
export function mensagemSaudade(nome: string, igreja: string): string {
  return (
    `Olá, ${primeiroNome(nome)}! Paz do Senhor. Aqui é da ${igreja}. ` +
    `Sentimos sua falta nos últimos cultos e queríamos saber como você está. ` +
    `Podemos orar por algo? Um abraço!`
  );
}

export function mensagemJustificativaLonga(nome: string, igreja: string): string {
  return (
    `Olá, ${primeiroNome(nome)}! Paz do Senhor. Aqui é da ${igreja}. ` +
    `Faz um tempo que não nos vemos e estamos com saudade. ` +
    `Como você está? Se precisar de algo, conte com a gente. Um abraço!`
  );
}

/** "AAAA-MM-DD" de hoje no fuso de Brasília (o servidor pode estar em UTC). */
export function hojeISO(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function somarDias(dataISO: string, dias: number): string {
  const d = new Date(`${dataISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function formatarData(dataISO: string | null): string {
  if (!dataISO) return "—";
  const [ano, mes, dia] = dataISO.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Dia da semana (0 = domingo) de uma data "AAAA-MM-DD". */
export function diaDaSemana(dataISO: string): number {
  return new Date(`${dataISO}T12:00:00Z`).getUTCDay();
}

type CultoQuando = Pick<Culto, "tipo" | "diaSemana" | "data">;

/** A data cai num dia em que o culto acontece? (o banco confere de novo) */
export function cultoAconteceEm(culto: CultoQuando, dataISO: string): boolean {
  if (culto.tipo === "especial") return culto.data === dataISO;
  return culto.diaSemana === diaDaSemana(dataISO);
}

/**
 * Última vez que o culto aconteceu, até hoje: hoje se é o dia dele, senão a
 * ocorrência anterior (fazer a chamada no dia seguinte é comum). Especial
 * ainda por vir não tem ocorrência: null.
 */
export function ultimaOcorrencia(culto: CultoQuando, hoje: string): string | null {
  if (culto.tipo === "especial") return culto.data && culto.data <= hoje ? culto.data : null;
  const recuo = (diaDaSemana(hoje) - (culto.diaSemana ?? 0) + 7) % 7;
  return somarDias(hoje, -recuo);
}

/** Margem, em minutos, para considerar que um culto de hoje "já começou". */
const MARGEM_INICIO_MIN = 60;

function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Qual culto a chamada deve sugerir agora.
 * 1. Culto de HOJE que já começou (ou começa na próxima hora): o mais recente.
 * 2. Culto de hoje que ainda vai acontecer: o mais cedo.
 * 3. Nenhum hoje: o que aconteceu por último (data + hora).
 * Especial ganha do semanal no mesmo horário (é o que a igreja vai fazer).
 * Só cultos ativos marcados para chamada.
 */
export function sugerirChamada(cultos: Culto[], hoje: string, horaAgora: string): SugestaoChamada | null {
  const candidatos = cultos
    .filter((c) => c.registraChamada && !c.removido)
    .map((c) => ({ culto: c, data: ultimaOcorrencia(c, hoje) }))
    .filter((c): c is { culto: Culto; data: string } => c.data !== null);
  if (candidatos.length === 0) return null;

  const agora = minutos(horaAgora);
  const desempate = (c: Culto) => (c.tipo === "especial" ? 1 : 0);
  const deHoje = candidatos.filter((c) => c.data === hoje);

  const comecados = deHoje
    .filter((c) => minutos(c.culto.hora) <= agora + MARGEM_INICIO_MIN)
    .sort((a, b) => minutos(b.culto.hora) - minutos(a.culto.hora) || desempate(b.culto) - desempate(a.culto));
  if (comecados.length > 0) return { ...comecados[0], hoje: true };

  const maisTarde = deHoje.sort(
    (a, b) => minutos(a.culto.hora) - minutos(b.culto.hora) || desempate(b.culto) - desempate(a.culto),
  );
  if (maisTarde.length > 0) return { ...maisTarde[0], hoje: true };

  const ultimo = candidatos.sort(
    (a, b) =>
      b.data.localeCompare(a.data) ||
      minutos(b.culto.hora) - minutos(a.culto.hora) ||
      desempate(b.culto) - desempate(a.culto),
  )[0];
  return { ...ultimo, hoje: false };
}

/** "HH:MM" agora, no fuso de Brasília. */
export function horaAgoraISO(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(agora);
}

export function descreverQuando(culto: Pick<Culto, "tipo" | "diaSemana" | "hora" | "data">): string {
  const hora = ` às ${culto.hora.slice(0, 5)}`;
  if (culto.tipo === "semanal") {
    const dia = culto.diaSemana ?? 0;
    // "Todo domingo", "Toda segunda".
    return `${dia === 0 || dia === 6 ? "Todo" : "Toda"} ${DIAS_SEMANA[dia].toLowerCase()}${hora}`;
  }
  return `${formatarData(culto.data)}${hora}`;
}
