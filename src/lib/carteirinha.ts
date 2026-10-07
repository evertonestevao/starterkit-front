import { idadeEm } from "@/lib/ebd";
import type { EstadoCarteirinha } from "@/types/carteirinha";

/**
 * Consentimento (LGPD), foto e carteirinha do membro: textos e pequenas
 * regras, sem I/O.
 */

/** 1MB. A tela já reduz a foto antes de enviar; isto é o teto do servidor e do bucket. */
export const MAX_FOTO_BYTES = 1024 * 1024;
/** Lado maior da foto depois de reduzida no navegador. */
export const FOTO_LADO_MAX = 720;

export const ESTADO_CARTEIRINHA_LABEL: Record<EstadoCarteirinha, string> = {
  valida: "Válida",
  vencida: "Vencida",
  inativa: "Sem validade",
  cancelada: "Cancelada",
};

/** O que dizer a quem lê o QR Code. */
export const ESTADO_CARTEIRINHA_TEXTO: Record<EstadoCarteirinha, string> = {
  valida: "Carteirinha válida.",
  vencida: "Esta carteirinha está vencida. Procure a secretaria da igreja para renovar.",
  inativa: "Esta carteirinha não está válida no momento. Procure a secretaria da igreja.",
  cancelada: "Esta carteirinha foi cancelada.",
};

/** Validade sugerida ao emitir: um ano a partir de hoje. */
export function validadePadrao(hojeISO: string): string {
  const [a, m, d] = hojeISO.split("-").map(Number) as [number, number, number];
  const data = new Date(Date.UTC(a + 1, m - 1, d));
  return data.toISOString().slice(0, 10);
}

/** Menor de 18 anos: o termo é assinado pelo responsável. Sem data de nascimento, trata como adulto. */
export function ehMenor(nascimento: string | null, hojeISO: string): boolean {
  const idade = idadeEm(nascimento, hojeISO);
  return idade !== null && idade < 18;
}

/** Código do QR em blocos de 4, para ler em voz alta: "A1B2 C3D4 E5F6 0789". */
export function codigoEmBlocos(codigo: string): string {
  return codigo.replace(/(.{4})(?=.)/g, "$1 ");
}

export const CODIGO_RE = /^[0-9A-Fa-f]{16}$/;

// ---------------------------------------------------------------------- termo
export const FINALIDADES = [
  {
    chave: "cadastro",
    titulo: "Cadastro e acompanhamento",
    texto:
      "Guardar meus dados de cadastro (nome, contatos, endereço, datas e vida na igreja) e registrar minha presença, para a igreja manter o rol de membros, entrar em contato comigo e me acompanhar.",
  },
  {
    chave: "foto",
    titulo: "Uso da minha foto",
    texto: "Guardar minha foto no cadastro e mostrá-la na minha ficha e na minha carteirinha de membro.",
  },
  {
    chave: "carteirinha",
    titulo: "Carteirinha de membro com verificação",
    texto:
      "Emitir minha carteirinha de membro com um QR Code. Entendo que quem ler esse código verá meu nome, o nome da igreja e se a carteirinha está válida.",
  },
] as const;

export type FinalidadeChave = (typeof FINALIDADES)[number]["chave"];

export interface TermoTexto {
  titulo: string;
  abertura: string;
  finalidades: Array<{ titulo: string; texto: string }>;
  direitos: string[];
}

/** O texto do termo para o membro (ou para o responsável, se for menor). */
export function textoDoTermo(d: { nome: string; igreja: string; menor: boolean }): TermoTexto {
  const quem = d.menor
    ? `Eu, responsável legal por ${d.nome}, autorizo a ${d.igreja} a tratar os dados pessoais dele(a)`
    : `Eu, ${d.nome}, autorizo a ${d.igreja} a tratar os meus dados pessoais`;
  return {
    titulo: "Termo de consentimento para tratamento de dados pessoais",
    abertura: `${quem}, inclusive o fato de eu fazer parte desta igreja, que a lei considera dado sensível, para as finalidades que eu marcar abaixo (Lei nº 13.709/2018 — LGPD).`,
    finalidades: FINALIDADES.map((f) => ({ titulo: f.titulo, texto: f.texto })),
    direitos: [
      "Os dados ficam guardados no sistema usado pela igreja e são vistos só por quem a igreja autoriza. Não são vendidos nem cedidos a terceiros.",
      "Posso pedir à secretaria da igreja, a qualquer momento, para ver, corrigir ou apagar meus dados, e posso retirar qualquer uma destas autorizações. Retirar a autorização da foto apaga a foto; retirar a da carteirinha cancela a carteirinha.",
      "Marcar só a primeira opção é suficiente para fazer parte do cadastro. As outras são opcionais.",
    ],
  };
}
