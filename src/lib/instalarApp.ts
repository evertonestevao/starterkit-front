/**
 * Instalar o app (PWA): regras puras sobre o navegador da pessoa, para a tela
 * saber o que oferecer. Sem I/O — quem chama passa o user agent e o que o
 * navegador informou.
 */

export type ComoInstalar =
  /** Já está aberto como app instalado: não oferece nada. */
  | "ja_instalado"
  /** Android/computador com Chrome, Edge etc.: o próprio navegador abre a janela de instalar. */
  | "botao"
  /** iPhone/iPad: não há janela automática; a pessoa usa Compartilhar → Adicionar à Tela de Início. */
  | "instrucoes_ios"
  /** iPhone/iPad fora do Safari: só o Safari instala. */
  | "abrir_no_safari"
  /** Navegador que não instala (ou ainda não avisou que pode): não oferece nada. */
  | "indisponivel";

export interface SituacaoDoNavegador {
  userAgent: string;
  /** `display-mode: standalone` (ou `navigator.standalone` no iOS). */
  aberturaComoApp: boolean;
  /** O navegador já disparou `beforeinstallprompt`. */
  temJanelaDeInstalar: boolean;
}

/** iPhone, iPad e iPod — inclusive o iPad que se apresenta como Mac (com toque). */
export function ehIos(userAgent: string, toque = false): boolean {
  return /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && toque);
}

/** No iOS, outros navegadores (Chrome, Firefox, Edge) usam "CriOS", "FxiOS", "EdgiOS". */
export function ehSafariNoIos(userAgent: string): boolean {
  return !/crios|fxios|edgios|opios|mercury/i.test(userAgent);
}

export function comoInstalar(s: SituacaoDoNavegador, toque = false): ComoInstalar {
  if (s.aberturaComoApp) return "ja_instalado";
  if (s.temJanelaDeInstalar) return "botao";
  if (ehIos(s.userAgent, toque)) return ehSafariNoIos(s.userAgent) ? "instrucoes_ios" : "abrir_no_safari";
  return "indisponivel";
}

/** Quantos dias o aviso de instalar fica escondido depois que a pessoa o dispensa. */
export const DIAS_SEM_AVISO = 30;

/** O aviso pode aparecer de novo? (`dispensadoEm` em ms; null = nunca dispensado) */
export function avisoLiberado(dispensadoEm: number | null, agora: number): boolean {
  return dispensadoEm === null || agora - dispensadoEm > DIAS_SEM_AVISO * 86_400_000;
}
