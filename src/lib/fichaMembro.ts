import type { EstadoCivil, FichaMembro, FormaEntrada, SexoMembro, SituacaoMembro } from "@/types/acompanhamento";

/** Textos e pequenas regras da ficha completa do membro. Sem I/O. */

export const SEXOS: SexoMembro[] = ["masculino", "feminino"];
export const SEXO_LABEL: Record<SexoMembro, string> = { masculino: "Masculino", feminino: "Feminino" };

export const ESTADOS_CIVIS: EstadoCivil[] = ["solteiro", "casado", "uniao_estavel", "divorciado", "viuvo"];
export const ESTADO_CIVIL_LABEL: Record<EstadoCivil, string> = {
  solteiro: "Solteiro(a)",
  casado: "Casado(a)",
  uniao_estavel: "União estável",
  divorciado: "Divorciado(a)",
  viuvo: "Viúvo(a)",
};

export const FORMAS_ENTRADA: FormaEntrada[] = ["batismo", "aclamacao", "transferencia", "outro"];
export const FORMA_ENTRADA_LABEL: Record<FormaEntrada, string> = {
  batismo: "Batismo",
  aclamacao: "Aclamação",
  transferencia: "Transferência (carta de outra igreja)",
  outro: "Outra",
};

export const SITUACOES: SituacaoMembro[] = ["ativo", "afastado", "transferido", "desligado", "falecido"];
export const SITUACAO_LABEL: Record<SituacaoMembro, string> = {
  ativo: "Ativo",
  afastado: "Afastado",
  transferido: "Transferido",
  desligado: "Desligado",
  falecido: "Falecido",
};

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

/** Quem tem cônjuge para informar. */
export function temConjuge(estadoCivil: EstadoCivil | null): boolean {
  return estadoCivil === "casado" || estadoCivil === "uniao_estavel";
}

/** "17012-345" enquanto digita; o banco guarda só os 8 dígitos. */
export function mascaraCep(valor: string | null | undefined): string {
  const digitos = (valor ?? "").replace(/\D/g, "").slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

/** Endereço numa linha só, pulando o que não foi preenchido; null se não há nada. */
export function enderecoEmLinha(
  f: Pick<FichaMembro, "logradouro" | "numero" | "complemento" | "bairro" | "cidade" | "uf" | "cep">,
): string | null {
  const rua = [f.logradouro, f.numero].filter(Boolean).join(", ");
  const cidade = [f.cidade, f.uf].filter(Boolean).join("/");
  const partes = [rua, f.complemento, f.bairro, cidade, f.cep ? `CEP ${mascaraCep(f.cep)}` : null].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/**
 * Ficha de quem ainda não tem nenhuma gravada. A situação de partida segue o
 * cadastro: inativo aparece como "afastado" (a mesma regra do banco).
 */
export function fichaVazia(ativo: boolean): FichaMembro {
  return {
    sexo: null,
    estadoCivil: null,
    naturalidade: null,
    profissao: null,
    conjugeNome: null,
    dataCasamento: null,
    paiNome: null,
    maeNome: null,
    filhos: null,
    cep: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
    dataConversao: null,
    entradaForma: null,
    membroDesde: null,
    igrejaOrigem: null,
    situacao: ativo ? "ativo" : "afastado",
    situacaoEm: null,
    situacaoMotivo: null,
  };
}

/** A ficha tem algo além da situação? (para a tela dizer "ainda não preenchida") */
export function fichaPreenchida(f: FichaMembro): boolean {
  return Object.entries(f).some(([campo, valor]) => !campo.startsWith("situacao") && valor !== null);
}
