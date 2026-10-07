"use client";

import { useState, type ChangeEvent } from "react";

const formatador = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatarCentavos(cents: number): string {
  return `R$ ${formatador.format(cents / 100)}`;
}

/**
 * Máscara de valor em reais: cada dígito digitado entra pela direita, como
 * numa maquininha de cartão — "5" vira "R$ 0,05", mais um "0" vira
 * "R$ 0,50" — a pessoa vê o valor formatado enquanto digita, sem risco de
 * confundir ponto com vírgula. O texto final já sai pronto para
 * `parseBrlToCents`, que também aceita o prefixo "R$".
 */
export function useMoneyInput(initialCents?: number | null) {
  const [value, setValue] = useState(() => (initialCents ? formatarCentavos(initialCents) : ""));

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const digitos = e.target.value.replace(/\D/g, "");
    setValue(digitos ? formatarCentavos(Number(digitos)) : "");
  }

  return { value, onChange };
}
