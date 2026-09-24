/**
 * Configurações da plataforma (linha única em `platform_settings`).
 *
 * Vaga `null` = ilimitado; `0` = igreja fechada para novos patrocinadores.
 */
export interface PlatformSettings {
  vagasSede: number | null;
  vagasSubsede: number | null;
  vagasCongregacao: number | null;
  /** Dias de atraso até a marca sair da vitrine. */
  carenciaMarcaDias: number;
  /** Mensalidade fixa quando a própria igreja assume o pagamento (sem patrocinador). */
  autopatrocinioAmountCents: number;
  updatedAt: string;
}
