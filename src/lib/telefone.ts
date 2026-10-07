/**
 * Máscara de telefone brasileiro, aplicada enquanto a pessoa digita:
 * "(11) 99999-9999" (celular) ou "(11) 3333-4444" (fixo).
 *
 * A pontuação só aparece quando já existe um dígito DEPOIS dela — "(11" e
 * não "(11) ". Sem isso o apagar trava: a pessoa tira o espaço, a máscara
 * devolve o espaço, e o cursor nunca chega ao dígito.
 *
 * Número de outro país (começa com "+" e não é +55) fica como foi digitado,
 * só sem caracteres que não são de telefone.
 */
export function mascaraTelefone(valor: string | null | undefined): string {
  const texto = (valor ?? "").trim();
  if (texto.startsWith("+") && !texto.startsWith("+55")) {
    return texto.replace(/[^0-9 ()+-]/g, "").slice(0, 20);
  }

  let digitos = texto.replace(/\D/g, "");
  // Com o código do país (55 + DDD + número): mantém o +55 na frente.
  let prefixo = "";
  if (texto.startsWith("+55") || (digitos.startsWith("55") && digitos.length > 11)) {
    prefixo = "+55 ";
    digitos = digitos.slice(2);
  }
  digitos = digitos.slice(0, 11);
  if (digitos.length === 0) return prefixo.trim();

  const ddd = digitos.slice(0, 2);
  const numero = digitos.slice(2);
  if (numero.length === 0) return `${prefixo}(${ddd}`;
  // Celular tem 9 dígitos (5 + 4); fixo, 8 (4 + 4).
  const corte = numero.length > 8 ? 5 : 4;
  const inicio = numero.slice(0, corte);
  const fim = numero.slice(corte);
  return `${prefixo}(${ddd}) ${inicio}${fim ? `-${fim}` : ""}`;
}

/**
 * So os digitos, para mandar a um provedor externo (pagamento, cobranca): a
 * tela guarda o telefone com mascara, e API de terceiro costuma recusar
 * parenteses e traco. Vazio vira undefined, para o campo nem ir no pedido.
 */
export function telefoneSoDigitos(valor: string | null | undefined): string | undefined {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos === "" ? undefined : digitos;
}
