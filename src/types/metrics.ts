/** Visitas à página de uma igreja num mês, enquanto a marca do patrocinador estava nela. */
export interface SponsorChurchMonthVisits {
  churchId: string;
  churchName: string;
  /** Primeiro dia do mês, "2026-09-01". */
  mes: string;
  visitas: number;
}

/** Números do piloto para a plataforma (agregados, sem dado de cliente). */
export interface PilotSummary {
  patrocinadoresPagantes: number;
  patrocinadoresEmAtraso: number;
  patrociniosNoAr: number;
  cobrancasPagas: number;
  renovacoes: number;
  recebidoMesCents: number;
}

/** Aberturas da página de uma igreja numa semana, por origem. */
export interface ChurchWeekVisits {
  churchId: string;
  churchName: string;
  /** Segunda-feira da semana, "2026-09-14". */
  semana: string;
  total: number;
  qr: number;
  nfc: number;
}
