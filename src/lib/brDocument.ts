/**
 * CPF/CNPJ (sem I/O). O provedor de cobrança recusa documento inválido; aqui
 * recusamos antes, com mensagem clara, em vez de um erro genérico do gateway.
 */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function allSameDigit(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || allSameDigit(cpf)) return false;

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || allSameDigit(cnpj)) return false;

  const checkDigit = (length: number): number => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, weight, i) => acc + Number(cnpj[i]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return checkDigit(12) === Number(cnpj[12]) && checkDigit(13) === Number(cnpj[13]);
}

/** Pessoa física exige CPF; negócio exige CNPJ. */
export function isValidDocumentFor(kind: "person" | "business", value: string): boolean {
  return kind === "person" ? isValidCpf(value) : isValidCnpj(value);
}
