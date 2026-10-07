"use client";

import { useRef, useState } from "react";
import type { EnderecoDoCep } from "@/adapters/cep/CepProvider";
import { buscarCepAction } from "@/server/actions/cep";

/**
 * Consulta o endereço quando o CEP fica completo (8 dígitos). Falha nunca
 * trava o formulário: vira um aviso, e a pessoa digita o endereço.
 */
export function useBuscaCep(aoEncontrar: (endereco: EnderecoDoCep) => void) {
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Só a resposta do último CEP digitado vale (a pessoa pode corrigir no meio da consulta).
  const ultimo = useRef("");

  async function conferir(valor: string) {
    const cep = valor.replace(/\D/g, "");
    if (cep === ultimo.current) return;
    ultimo.current = cep;
    setAviso(null);
    if (cep.length !== 8) {
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const resultado = await buscarCepAction(cep).catch(() => ({
      error: "Não foi possível consultar o CEP agora. Preencha o endereço à mão.",
      endereco: undefined,
    }));
    if (ultimo.current !== cep) return;
    setBuscando(false);
    if (resultado.endereco) aoEncontrar(resultado.endereco);
    else setAviso(resultado.error ?? null);
  }

  return { conferir, buscando, aviso };
}
