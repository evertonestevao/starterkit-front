"use client";

import { createContext, useContext } from "react";
import { NOMES_PADRAO, type NomesNiveis } from "@/lib/niveisRede";

/**
 * Nomes dos níveis da rede (sede, subsede, congregação) como a rede da igreja
 * ativa os chama. Carregado no servidor pelo layout do dashboard; fora dele
 * (ou sem configuração) vale o padrão da plataforma.
 */
const NomesNiveisContext = createContext<NomesNiveis>(NOMES_PADRAO);

export function NomesNiveisProvider({ nomes, children }: { nomes: NomesNiveis; children: React.ReactNode }) {
  return <NomesNiveisContext.Provider value={nomes}>{children}</NomesNiveisContext.Provider>;
}

export function useNomesNiveis(): NomesNiveis {
  return useContext(NomesNiveisContext);
}
