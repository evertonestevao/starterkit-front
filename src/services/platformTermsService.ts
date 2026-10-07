import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";
import {
  PUBLICOS_DOS_TERMOS,
  TERMOS_MAX_CARACTERES,
  TERMOS_MIN_CARACTERES,
  carimbarVersao,
  type PublicoDosTermos,
} from "@/lib/termos";

/**
 * Termos de Uso, do lado da PLATAFORMA: a moderação publica uma versão nova
 * do documento de um público.
 *
 * Versão publicada não se edita: cada aceite aponta para o texto exato que a
 * pessoa leu, e mudar esse texto depois destruiria a prova. "Editar os
 * termos" é sempre publicar a versão seguinte — e quem aceitou a anterior
 * aceita de novo no próximo acesso.
 */

export interface VersaoDosTermos {
  id: string;
  version: number;
  publishedAt: string;
  isCurrent: boolean;
}

export interface TermosVigentes extends VersaoDosTermos {
  content: string;
}

export interface PlatformTermsRepository {
  vigente(audience: PublicoDosTermos): Promise<TermosVigentes | null>;
  /** Todas as versões do público, da mais nova para a mais antiga (sem o texto). */
  historico(audience: PublicoDosTermos): Promise<VersaoDosTermos[]>;
  /**
   * RPC platform_publicar_termos. `versaoEsperada` é o número que a versão
   * nova deve receber: se outra pessoa publicou no meio, o banco recusa.
   */
  publicar(audience: PublicoDosTermos, content: string, versaoEsperada: number): Promise<number>;
}

const publicarSchema = z.object({
  audience: z.enum(PUBLICOS_DOS_TERMOS),
  content: z
    .string()
    .trim()
    .min(TERMOS_MIN_CARACTERES, "O texto está curto demais para ser o documento inteiro.")
    .max(TERMOS_MAX_CARACTERES, "O texto passou do tamanho máximo."),
});

export function createPlatformTermsService(deps: {
  repo: PlatformTermsRepository;
  /** AAAA-MM-DD de hoje, no fuso da plataforma. */
  hoje: () => string;
}) {
  const { repo, hoje } = deps;

  return {
    /** O documento vigente do público e o histórico de versões. */
    async carregar(
      audience: PublicoDosTermos,
    ): Promise<{ vigente: TermosVigentes | null; historico: VersaoDosTermos[]; proximaVersao: number }> {
      const [vigente, historico] = await Promise.all([repo.vigente(audience), repo.historico(audience)]);
      const maior = historico.reduce((max, v) => Math.max(max, v.version), 0);
      return { vigente, historico, proximaVersao: maior + 1 };
    },

    /** Publica a versão seguinte e devolve o número dela. */
    async publicar(input: { audience: string; content: string }): Promise<number> {
      const parsed = publicarSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const { audience, content } = parsed.data;

      const [vigente, historico] = await Promise.all([repo.vigente(audience), repo.historico(audience)]);
      const proxima = historico.reduce((max, v) => Math.max(max, v.version), 0) + 1;
      const carimbado = carimbarVersao(content, proxima, hoje());

      // Publicar o mesmo texto obrigaria todo mundo a aceitar de novo por nada.
      if (vigente && carimbarVersao(vigente.content.trim(), proxima, hoje()) === carimbado) {
        throw new AppError("validation_error", "O texto está igual ao da versão vigente — não há o que publicar.");
      }
      return repo.publicar(audience, carimbado, proxima);
    },
  };
}

export type PlatformTermsService = ReturnType<typeof createPlatformTermsService>;
