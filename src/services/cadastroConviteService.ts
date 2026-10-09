import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";

/**
 * Cadastro só por convite (piloto): a plataforma liga/desliga o cadastro
 * aberto e gera convites de igreja nova (uso único). O banco confere que quem
 * pede é da plataforma e registra cada decisão.
 */

export interface ConviteIgreja {
  id: string;
  descricao: string;
  criadoEm: string;
  expiraEm: string;
  revogadoEm: string | null;
  usadoEm: string | null;
  /** Nome da igreja criada com o convite. */
  igreja: string | null;
}

export interface CadastroConviteRepository {
  cadastroAberto(): Promise<boolean>;
  definirCadastroAberto(aberto: boolean): Promise<void>;
  criarConvite(input: { tokenHash: string; descricao: string; validadeDias: number }): Promise<string>;
  listarConvites(): Promise<ConviteIgreja[]>;
  revogarConvite(id: string): Promise<void>;
}

const conviteSchema = z.object({
  descricao: z.string().trim().min(2, "Diga para quem é o convite").max(120, "Descrição longa demais"),
  validadeDias: z.coerce.number().int().min(1, "Validade mínima de 1 dia").max(30, "Validade máxima de 30 dias"),
});

export function createCadastroConviteService(deps: {
  repo: CadastroConviteRepository;
  tokens: { make(): string; hash(token: string): string };
  appUrl: string;
}) {
  const { repo, tokens } = deps;
  const base = deps.appUrl.replace(/\/+$/, "");

  return {
    cadastroAberto: () => repo.cadastroAberto(),
    definirCadastroAberto: (aberto: boolean) => repo.definirCadastroAberto(aberto === true),
    listarConvites: () => repo.listarConvites(),

    /** O link aparece só nesta resposta: o banco guarda o hash. */
    async gerarConvite(input: unknown): Promise<{ link: string; expiraEm: string }> {
      const parsed = conviteSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const token = tokens.make();
      const expiraEm = await repo.criarConvite({ tokenHash: tokens.hash(token), ...parsed.data });
      return { link: `${base}/nova-igreja/${token}`, expiraEm };
    },

    async revogarConvite(id: unknown): Promise<void> {
      const parsed = z.uuid().safeParse(id);
      if (!parsed.success) throw new AppError("not_found", "Convite não encontrado.");
      await repo.revogarConvite(parsed.data);
    },
  };
}

export type CadastroConviteService = ReturnType<typeof createCadastroConviteService>;
