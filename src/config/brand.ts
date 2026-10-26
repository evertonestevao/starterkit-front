/**
 * Identidade do produto — ÚNICO lugar a editar ao clonar o starter.
 * A cor primária fica nos tokens CSS em src/app/globals.css (--primary).
 */
export const brand = {
  /** Nome exibido na LP, título das páginas e sidebar. */
  name: "StarterKit",
  /** Descrição curta usada em metadata e na LP. */
  tagline: "Base multi-tenant pronta para lançar seu próximo SaaS",
  /** Domínio público (links de email usam APP_URL do servidor). */
  url: "https://example.com",
  /**
   * Dados legais exibidos no rodapé e nas páginas de política (Decreto 7.962/2013).
   * PLACEHOLDERS — preencha com os dados reais antes de ir para produção.
   */
  legal: {
    companyName: "Sua Empresa Ltda.",
    cnpj: "00.000.000/0000-00",
    address: "Rua Exemplo, 123 — Cidade/UF — CEP 00000-000",
    supportEmail: "suporte@example.com",
    /** Encarregado de dados (DPO) — canal para direitos do titular (LGPD, art. 41). */
    dpoEmail: "privacidade@example.com",
  },
} as const;
