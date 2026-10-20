import type { ChurchTipo } from "@/types/database";

/**
 * Uma igreja na tela "Nossas igrejas" da sede (/igreja/{sede}/igrejas): só o
 * que já é público na página dela, com o link. Eventos e campanhas das outras
 * igrejas ficam na página de cada uma, de propósito.
 */

export interface IgrejaDaRedePublica {
  id: string;
  name: string;
  sobrenome: string | null;
  address: string | null;
  /** A chave completa ("sede~codigo"), para montar o link. */
  public_code: string;
  tipo: ChurchTipo;
  logo_url: string | null;
}
