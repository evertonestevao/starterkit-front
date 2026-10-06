/**
 * Endereço público da igreja.
 *
 * Cada igreja tem um `codigo` único DENTRO da rede dela. A chave que acha a
 * igreja no sistema inteiro (`public_code`, montada pelo banco) é:
 *
 *   igreja do topo (sede ou sem rede):  "adipiranga"
 *   igreja abaixo de outra:             "adipiranga~lins"
 *
 * O "~" é interno. No endereço que as pessoas veem a rede e a igreja são
 * pedaços separados: /igreja/adipiranga/lins. O proxy traduz esse endereço
 * para a rota interna /igreja/adipiranga~lins (uma pasta só no App Router).
 *
 * Todo link para a página de uma igreja é montado com `caminhoDaIgreja`.
 * Sem I/O.
 */

export const SEPARADOR_REDE = "~";

/** Subpáginas de /igreja/{codigo}/... — por isso não podem ser código de igreja. */
export const SUBPAGINAS_DA_IGREJA = ["eventos", "campanhas"];

const CODIGO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A rede (código da sede) e o código próprio de uma chave. */
export function partesDaChave(publicCode: string): { rede: string | null; codigo: string } {
  const i = publicCode.indexOf(SEPARADOR_REDE);
  return i === -1
    ? { rede: null, codigo: publicCode }
    : { rede: publicCode.slice(0, i), codigo: publicCode.slice(i + 1) };
}

/** "/igreja/adipiranga/lins" (ou "/igreja/adipiranga" para a igreja do topo). */
export function caminhoDaIgreja(publicCode: string): string {
  const { rede, codigo } = partesDaChave(publicCode);
  return rede ? `/igreja/${rede}/${codigo}` : `/igreja/${codigo}`;
}

/**
 * Endereço pedido → rota interna, quando é o de uma igreja abaixo de outra:
 * "/igreja/adipiranga/lins/eventos" → "/igreja/adipiranga~lins/eventos".
 * Devolve null quando não há o que traduzir (igreja do topo, subpágina dela
 * ou qualquer outra rota).
 */
export function rotaInternaDaIgreja(pathname: string): string | null {
  const partes = pathname.split("/");
  // ["", "igreja", rede, codigo, ...resto]
  if (partes[1] !== "igreja" || partes.length < 4) return null;
  const [rede, codigo] = [partes[2], partes[3]];
  if (!CODIGO.test(rede) || !CODIGO.test(codigo) || SUBPAGINAS_DA_IGREJA.includes(codigo)) return null;
  return ["", "igreja", `${rede}${SEPARADOR_REDE}${codigo}`, ...partes.slice(4)].join("/");
}

/**
 * Alguém abriu a rota interna direto ("/igreja/adipiranga~lins"): devolve o
 * endereço certo para redirecionar. Null se o caminho já está no formato público.
 */
export function enderecoPublicoDaRotaInterna(pathname: string): string | null {
  const partes = pathname.split("/");
  if (partes[1] !== "igreja" || !partes[2]) return null;
  const chave = partes[2].replace(/%7e/gi, SEPARADOR_REDE);
  if (!chave.includes(SEPARADOR_REDE)) return null;
  const { rede, codigo } = partesDaChave(chave);
  if (!rede || !CODIGO.test(rede) || !CODIGO.test(codigo)) return null;
  return ["", "igreja", rede, codigo, ...partes.slice(3)].join("/");
}

/**
 * Domínio próprio de uma igreja DO TOPO (sede, ou igreja sem rede): o domínio
 * vale para a rede inteira e esconde o código da sede, que ele já representa.
 *
 *   /                      → a página da sede
 *   /eventos, /campanhas   → as subpáginas da sede
 *   /igreja/lins           → a igreja "lins" DESTA rede
 *
 * Os endereços no formato da plataforma (/igreja/{sede}/lins), que as próprias
 * páginas usam nos links, redirecionam para a forma curta. Igreja de outra
 * rede não tem como aparecer: todo código é procurado só dentro desta.
 *
 * Devolve o que fazer com o caminho, ou null para seguir o fluxo normal
 * (login, termos, arquivos...). `chaveDaSede` não tem "~".
 */
export function resolverNoDominioDaRede(
  chaveDaSede: string,
  pathname: string,
): { acao: "reescrever" | "redirecionar"; caminho: string } | null {
  const partes = pathname.split("/").filter(Boolean);
  const resto = (de: number) => (partes.length > de ? `/${partes.slice(de).join("/")}` : "");

  if (partes.length === 0) return { acao: "reescrever", caminho: `/igreja/${chaveDaSede}` };
  if (SUBPAGINAS_DA_IGREJA.includes(partes[0])) {
    return { acao: "reescrever", caminho: `/igreja/${chaveDaSede}/${partes.join("/")}` };
  }
  if (partes[0] !== "igreja" || !partes[1]) return null;

  const primeiro = partes[1].replace(/%7e/gi, SEPARADOR_REDE);
  // Formato da plataforma apontando para ESTA rede: encurta.
  if (primeiro === chaveDaSede) {
    if (!partes[2]) return { acao: "redirecionar", caminho: "/" };
    if (SUBPAGINAS_DA_IGREJA.includes(partes[2])) return { acao: "redirecionar", caminho: resto(2) };
    return { acao: "redirecionar", caminho: `/igreja/${partes[2]}${resto(3)}` };
  }
  // Rota interna aberta direto ("sede~lins"): só a desta rede encurta; outra não existe aqui.
  if (primeiro.includes(SEPARADOR_REDE)) {
    const { rede, codigo } = partesDaChave(primeiro);
    return rede === chaveDaSede && CODIGO.test(codigo)
      ? { acao: "redirecionar", caminho: `/igreja/${codigo}${resto(2)}` }
      : { acao: "reescrever", caminho: "/igreja/nao-encontrada~nesta-rede" };
  }
  if (!CODIGO.test(primeiro)) return null;
  // /igreja/{codigo}: uma igreja desta rede. Código de outra rede simplesmente não é achado.
  return { acao: "reescrever", caminho: `/igreja/${chaveDaSede}${SEPARADOR_REDE}${primeiro}${resto(2)}` };
}
