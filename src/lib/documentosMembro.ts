import { formatarData } from "@/lib/acompanhamento";
import { formatChurchName } from "@/lib/churchName";
import { ESTADO_CIVIL_LABEL } from "@/lib/fichaMembro";
import { saudar } from "@/lib/saudacao";
import type { EstadoCivil } from "@/types/acompanhamento";
import type {
  DocumentoPronto,
  IgrejaDoDocumento,
  MembroDoDocumento,
  ModeloDocumento,
  ModeloGravado,
  TipoDocumento,
} from "@/types/secretaria";

/**
 * Documentos da secretaria: declaração de membro, carta de recomendação e
 * carta de transferência. Regras puras (sem I/O).
 *
 * O texto é um MODELO: onde aparece um campo entre chaves — {nome}, {igreja} —
 * entra o dado do membro ou da igreja na hora de emitir. A plataforma traz um
 * texto padrão; cada igreja pode escrever o seu.
 */

export const TIPOS_DOCUMENTO: TipoDocumento[] = ["declaracao", "recomendacao", "transferencia"];

export const DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  declaracao: "Declaração de membro",
  recomendacao: "Carta de recomendação",
  transferencia: "Carta de transferência",
};

export function isTipoDocumento(valor: unknown): valor is TipoDocumento {
  return typeof valor === "string" && (TIPOS_DOCUMENTO as string[]).includes(valor);
}

/** A carta de transferência só faz sentido com a igreja de destino. */
export function exigeDestino(tipo: TipoDocumento): boolean {
  return tipo === "transferencia";
}

/** A declaração não é endereçada a outra igreja. */
export function aceitaDestino(tipo: TipoDocumento): boolean {
  return tipo !== "declaracao";
}

// -------------------------------------------------------------------- campos
export const CAMPOS = [
  { chave: "nome", descricao: "Nome completo do membro" },
  { chave: "tratamento", descricao: "“o irmão” ou “a irmã”, conforme o sexo na ficha" },
  { chave: "igreja", descricao: "Nome da igreja que emite" },
  { chave: "destino", descricao: "Igreja a quem a carta é endereçada" },
  { chave: "saudacao", descricao: "A saudação da igreja (ex.: “A paz do Senhor!”)" },
  { chave: "membro_desde", descricao: "Data em que entrou para o quadro de membros" },
  { chave: "batismo", descricao: "Data do batismo nas águas" },
  { chave: "nascimento", descricao: "Data de nascimento" },
  { chave: "estado_civil", descricao: "Estado civil" },
  { chave: "cargos", descricao: "Cargos que exerce na igreja" },
  { chave: "pastor", descricao: "Nome do Pastor da igreja" },
  { chave: "data", descricao: "Data de hoje por extenso" },
] as const;

export type CampoDocumento = (typeof CAMPOS)[number]["chave"];

const CHAVES = new Set<string>(CAMPOS.map((c) => c.chave));
const CAMPO_RE = /\{([^{}\n]*)\}/g;

/** Campos entre chaves que o texto usa, na ordem, sem repetir. */
export function camposUsados(texto: string): string[] {
  const vistos = new Set<string>();
  for (const m of texto.matchAll(CAMPO_RE)) vistos.add(m[1]!.trim());
  return [...vistos];
}

/** Campos escritos no texto que não existem (erro de digitação: {nomee}). */
export function camposDesconhecidos(texto: string): string[] {
  return camposUsados(texto).filter((c) => !CHAVES.has(c));
}

// ------------------------------------------------------------------- padrões
/** Textos da plataforma: valem enquanto nem a igreja nem uma acima escrever o seu. */
export const MODELOS_PADRAO: Record<TipoDocumento, { titulo: string; corpo: string }> = {
  declaracao: {
    titulo: "Declaração de membro",
    corpo: [
      "Declaramos, para os devidos fins, que {tratamento} {nome} é membro desta igreja, {igreja}, desde {membro_desde}, encontrando-se em plena comunhão.",
      "Por ser verdade, firmamos a presente declaração.",
    ].join("\n\n"),
  },
  recomendacao: {
    titulo: "Carta de recomendação",
    corpo: [
      "À {destino}.",
      "{saudacao}",
      "Apresentamos {tratamento} {nome}, membro desta igreja, {igreja}, em plena comunhão, que estará entre os irmãos por algum tempo.",
      "Recomendamos que seja recebido(a) no Senhor, com o amor cristão que nos une.",
      "Esta carta vale por 30 dias a partir da data de emissão.",
    ].join("\n\n"),
  },
  transferencia: {
    titulo: "Carta de transferência",
    corpo: [
      "À {destino}.",
      "{saudacao}",
      "Comunicamos que {tratamento} {nome}, batizado(a) nas águas em {batismo}, é membro desta igreja, {igreja}, desde {membro_desde}, e se encontra em plena comunhão.",
      "A seu pedido, concedemos a presente carta de transferência, recomendando que seja recebido(a) como membro dessa igreja.",
      "A partir do recebimento desta carta, deixa de pertencer ao nosso rol de membros.",
    ].join("\n\n"),
  },
};

/** O modelo que vale para cada documento: o gravado (próprio ou herdado) ou o padrão. */
export function resolverModelos(gravados: ModeloGravado[], churchId: string): ModeloDocumento[] {
  return TIPOS_DOCUMENTO.map((tipo) => {
    const g = gravados.find((m) => m.tipo === tipo);
    if (!g) return { tipo, ...MODELOS_PADRAO[tipo], origem: "padrao" as const, origemNome: null };
    const propria = g.origemChurchId === churchId;
    return {
      tipo,
      titulo: g.titulo,
      corpo: g.corpo,
      origem: propria ? ("propria" as const) : ("herdado" as const),
      origemNome: propria ? null : g.origemNome,
    };
  });
}

// --------------------------------------------------------------------- datas
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "2026-10-06" → "6 de outubro de 2026". */
export function dataPorExtenso(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split("-").map(Number) as [number, number, number];
  return `${dia === 1 ? "1º" : dia} de ${MESES[mes - 1]} de ${ano}`;
}

// ------------------------------------------------------------------- valores
/** O que escrever quando a ficha não tem o dado. */
export const NAO_INFORMADO = "não informado";

export interface DadosDoDocumento {
  membro: MembroDoDocumento;
  igreja: IgrejaDoDocumento;
  destino: string | null;
  /** AAAA-MM-DD. */
  hoje: string;
}

/** Valor de cada campo; `null` = a ficha (ou a igreja) não tem o dado. */
export function valoresDosCampos(d: DadosDoDocumento): Record<CampoDocumento, string | null> {
  const { membro, igreja } = d;
  return {
    nome: membro.nome,
    tratamento: membro.sexo === "masculino" ? "o irmão" : membro.sexo === "feminino" ? "a irmã" : "o(a) irmão(ã)",
    igreja: formatChurchName(igreja.nome, igreja.sobrenome),
    destino: d.destino?.trim() || null,
    saudacao: saudar(igreja.saudacao),
    membro_desde: membro.membroDesde ? formatarData(membro.membroDesde) : null,
    batismo: membro.batismo ? formatarData(membro.batismo) : null,
    nascimento: membro.nascimento ? formatarData(membro.nascimento) : null,
    estado_civil: membro.estadoCivil ? (ESTADO_CIVIL_LABEL[membro.estadoCivil as EstadoCivil] ?? null) : null,
    cargos: membro.cargos.length > 0 ? membro.cargos.join(", ") : null,
    pastor: igreja.pastor,
    data: dataPorExtenso(d.hoje),
  };
}

/** Descrição dos campos que o modelo usa e que estão sem dado — para avisar antes de emitir. */
export function camposFaltando(corpo: string, d: DadosDoDocumento): string[] {
  const valores = valoresDosCampos(d);
  return camposUsados(corpo)
    .filter((c): c is CampoDocumento => CHAVES.has(c))
    .filter((c) => valores[c] === null)
    .map((c) => CAMPOS.find((x) => x.chave === c)!.descricao);
}

/** Troca os campos pelos valores. Campo sem dado vira "não informado"; campo desconhecido fica como está. */
export function preencher(texto: string, d: DadosDoDocumento): string {
  const valores = valoresDosCampos(d);
  return texto.replace(CAMPO_RE, (inteiro, bruto: string) => {
    const chave = bruto.trim();
    if (!CHAVES.has(chave)) return inteiro;
    return valores[chave as CampoDocumento] ?? NAO_INFORMADO;
  });
}

/** O documento pronto: título, parágrafos (um por bloco separado por linha em branco), data e assinatura. */
export function montarDocumento(
  modelo: Pick<ModeloDocumento, "tipo" | "titulo" | "corpo">,
  d: DadosDoDocumento,
): DocumentoPronto {
  const paragrafos = preencher(modelo.corpo, d)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  return {
    tipo: modelo.tipo,
    titulo: preencher(modelo.titulo, d),
    paragrafos,
    igreja: formatChurchName(d.igreja.nome, d.igreja.sobrenome),
    enderecoIgreja: d.igreja.endereco,
    dataExtenso: dataPorExtenso(d.hoje),
    pastor: d.igreja.pastor,
  };
}

/** Membro e igreja de mentira, para a igreja ver como o modelo dela fica impresso. */
export function dadosDeExemplo(igreja: IgrejaDoDocumento, hoje: string): DadosDoDocumento {
  return {
    membro: {
      nome: "Maria Aparecida de Souza",
      sexo: "feminino",
      nascimento: "1985-03-12",
      estadoCivil: "casado",
      batismo: "2004-11-21",
      membroDesde: "2005-01-09",
      cargos: ["Diaconisa"],
    },
    igreja: { ...igreja, pastor: igreja.pastor ?? "Nome do Pastor" },
    destino: "Igreja de destino",
    hoje,
  };
}
