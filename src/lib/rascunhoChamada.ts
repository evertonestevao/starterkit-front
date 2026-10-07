/**
 * Rascunho da chamada guardado no aparelho (localStorage), para o que foi
 * marcado não se perder se a internet cair na hora de salvar ou se a tela
 * fechar. Funções puras: o armazenamento e o relógio vêm de fora.
 *
 * Fica só no aparelho de quem está fazendo a chamada e some depois de 24h —
 * um rascunho mais velho que isso provavelmente já não vale (a chamada pode
 * ter sido feita por outra pessoa, o rol pode ter mudado).
 */

export const VALIDADE_RASCUNHO_MS = 24 * 60 * 60 * 1000;
const VERSAO = 1;
const PREFIXO = "chamada-rascunho:";

/** O mínimo de Storage que usamos (localStorage serve; em teste, um Map). */
export interface Armazenamento {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
}

export interface Rascunho<T> {
  dados: T;
  /** Quando foi guardado (ms desde 1970). */
  salvoEm: number;
  /** Já tentou enviar e não conseguiu (sem conexão). */
  pendente: boolean;
}

/** Guarda o rascunho. Falha em silêncio (aparelho sem espaço, modo privado): a chamada segue na memória. */
export function gravarRascunho<T>(
  armazenamento: Armazenamento,
  chave: string,
  dados: T,
  agora: number,
  pendente = false,
): void {
  try {
    armazenamento.setItem(PREFIXO + chave, JSON.stringify({ v: VERSAO, dados, salvoEm: agora, pendente }));
  } catch {
    // Sem onde guardar: nada a fazer aqui.
  }
}

/** Lê o rascunho; vencido, de outra versão ou corrompido é apagado e devolve null. */
export function lerRascunho<T>(armazenamento: Armazenamento, chave: string, agora: number): Rascunho<T> | null {
  try {
    const bruto = armazenamento.getItem(PREFIXO + chave);
    if (!bruto) return null;
    const lido = JSON.parse(bruto) as { v?: number; dados?: T; salvoEm?: number; pendente?: boolean };
    const valido =
      lido.v === VERSAO &&
      typeof lido.salvoEm === "number" &&
      lido.dados !== undefined &&
      agora - lido.salvoEm >= 0 &&
      agora - lido.salvoEm <= VALIDADE_RASCUNHO_MS;
    if (!valido) {
      armazenamento.removeItem(PREFIXO + chave);
      return null;
    }
    return { dados: lido.dados as T, salvoEm: lido.salvoEm as number, pendente: lido.pendente === true };
  } catch {
    try {
      armazenamento.removeItem(PREFIXO + chave);
    } catch {
      // idem
    }
    return null;
  }
}

export function apagarRascunho(armazenamento: Armazenamento, chave: string): void {
  try {
    armazenamento.removeItem(PREFIXO + chave);
  } catch {
    // idem
  }
}

/**
 * Do que veio do rascunho, fica só o que ainda existe na lista de hoje: quem
 * saiu do rol (ou da classe) desde então é descartado, e quem entrou depois
 * fica com o valor da tela.
 */
export function manterSoConhecidos<V>(doRascunho: Record<string, V>, idsAtuais: string[]): Record<string, V> {
  const conhecidos = new Set(idsAtuais);
  return Object.fromEntries(Object.entries(doRascunho).filter(([id]) => conhecidos.has(id)));
}
