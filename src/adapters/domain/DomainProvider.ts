import type { ProviderDomainState } from "@/types/domain";

/**
 * Interface única de provedor de domínio. Mesma regra do PaymentGateway: nenhum
 * service ou componente fala com a API da Vercel direto. Trocar de plataforma
 * (Netlify, Cloudflare, servidor próprio) é implementar esta interface.
 */
export interface DomainProvider {
  /** Nome do provedor, para log e auditoria. */
  readonly name: string;

  /**
   * Valores de DNS que a igreja precisa apontar. Ficam no provedor porque são
   * dele — e mudam de tempos em tempos sem aviso.
   */
  readonly dns: { aRecord: string; cnameTarget: string };

  /**
   * Registra o domínio no projeto. Domínio já em uso por outra conta/projeto
   * deve virar AppError("conflict") — é o caso comum de erro do usuário.
   */
  addDomain(domain: string): Promise<ProviderDomainState>;

  /** Estado atual: posse verificada, DNS apontado, desafios pendentes. */
  getDomainState(domain: string): Promise<ProviderDomainState>;

  /** Pede ao provedor para reavaliar agora (usado pelo botão "verificar"). */
  verifyDomain(domain: string): Promise<ProviderDomainState>;

  /** Remove o domínio do projeto. Domínio inexistente NÃO é erro. */
  removeDomain(domain: string): Promise<void>;
}
