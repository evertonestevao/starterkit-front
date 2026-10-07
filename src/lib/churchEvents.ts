/**
 * Como um evento da igreja aparece para quem visita: data, horário e preço.
 *
 * Sempre no fuso de Brasília. O servidor roda em UTC, e sem fixar o fuso o
 * culto das 19h viraria "22:00" na tela — o tipo de erro que faz alguém
 * chegar três horas atrasado.
 */

const FUSO = "America/Sao_Paulo";

function partes(iso: string) {
  const data = new Date(iso);
  const pega = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, ...opts }).format(data);
  return {
    dia: pega({ day: "2-digit" }),
    mes: pega({ month: "short" }).replace(".", "").toUpperCase(),
    diaSemana: pega({ weekday: "long" }),
    dataLonga: pega({ day: "numeric", month: "long" }),
    hora: pega({ hour: "2-digit", minute: "2-digit" }),
    chaveDia: pega({ year: "numeric", month: "2-digit", day: "2-digit" }),
  };
}

function capitaliza(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Selo de data do cartão: { dia: "27", mes: "SET" }. */
export function eventDateBadge(inicio: string): { dia: string; mes: string } {
  const p = partes(inicio);
  return { dia: p.dia, mes: p.mes };
}

/**
 * "Sábado, 27 de setembro · 18:00". Com fim no mesmo dia: "· 18:00 às 21:00".
 * Com fim em outro dia (retiro): "Sábado, 17 de outubro, 08:00 até domingo,
 * 18 de outubro, 17:00".
 */
export function eventWhen(inicio: string, fim: string | null): string {
  const a = partes(inicio);
  const cabeca = `${capitaliza(a.diaSemana)}, ${a.dataLonga}`;
  if (!fim) return `${cabeca} · ${a.hora}`;

  const b = partes(fim);
  if (a.chaveDia === b.chaveDia) return `${cabeca} · ${a.hora} às ${b.hora}`;
  return `${cabeca}, ${a.hora} até ${b.diaSemana}, ${b.dataLonga}, ${b.hora}`;
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "Gratuito" ou "R$ 180,00". */
export function eventPrice(precoCents: number): string {
  return precoCents > 0 ? REAIS.format(precoCents / 100) : "Gratuito";
}

/** Resumo de uma linha para o cartão, sem cortar palavra no meio. */
export function eventSummary(descricao: string | null, max = 140): string | null {
  const texto = descricao?.replace(/\s+/g, " ").trim();
  if (!texto) return null;
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return `${corte.slice(0, ultimoEspaco > max * 0.6 ? ultimoEspaco : max).trimEnd()}…`;
}

/**
 * O campo <input type="datetime-local"> devolve "2026-10-17T19:00", SEM fuso.
 * Quem cadastra está pensando no horário de Brasília; sem fixar isso, o
 * servidor (em UTC) gravaria 19:00 de Londres e o evento apareceria às 16:00.
 *
 * -03:00 fixo: o Brasil não tem horário de verão desde 2019. Se voltar a
 * ter, é aqui que muda.
 */
export function brasiliaLocalToIso(local: string): string | null {
  const texto = local.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(texto)) return null;
  const comSegundos = texto.length === 16 ? `${texto}:00` : texto;
  const data = new Date(`${comSegundos}-03:00`);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

/** Volta: ISO → valor para preencher um datetime-local no horário de Brasília. */
export function isoToBrasiliaLocal(iso: string): string {
  const data = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return data.toISOString().slice(0, 16);
}

/**
 * "180", "180,00", "R$ 1.250,50", "1250.5" → centavos. Vazio ou zero =
 * gratuito (0). Texto que não é valor → null, para o formulário recusar em
 * vez de gravar um preço errado.
 */
export function parseBrlToCents(texto: string | null | undefined): number | null {
  const limpo = (texto ?? "").replace(/R\$|\s/g, "");
  if (limpo === "") return 0;

  let normalizado: string;
  if (limpo.includes(",")) {
    // Formato brasileiro: ponto é milhar, vírgula é decimal.
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    // "1.250" sem vírgula: ponto como milhar.
    normalizado = limpo.replace(/\./g, "");
  } else {
    normalizado = limpo;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  return Math.round(Number(normalizado) * 100);
}


/**
 * Centavos -> "180,00", para preencher o campo de valor na edição. Vírgula
 * como separador decimal: é o que `parseBrlToCents` lê de volta, e é como a
 * pessoa digitou da primeira vez.
 */
export function centsToBrl(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
