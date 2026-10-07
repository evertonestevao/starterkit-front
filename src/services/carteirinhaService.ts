import { z } from "zod";
import { CODIGO_RE, MAX_FOTO_BYTES } from "@/lib/carteirinha";
import { AppError, toValidationError } from "@/lib/errors";
import { EXTENSAO_POR_TIPO, sniffImageType } from "@/lib/imageValidation";
import type {
  Carteirinha,
  CarteirinhaDoMembro,
  Consentimento,
  ConsentimentoInput,
  FotoMembro,
  VerificacaoCarteirinha,
} from "@/types/carteirinha";
import type { RoleCode } from "@/types/database";

/**
 * Consentimento do membro (LGPD), foto e carteirinha.
 *
 * Filiação religiosa é dado sensível: a foto só entra, e a carteirinha só é
 * emitida, se o termo assinado pelo membro disser que pode. Retirar o
 * consentimento apaga a foto e cancela a carteirinha. O banco repete as
 * mesmas travas; aqui elas viram mensagem clara antes de chegar lá.
 *
 * É do módulo Membros, só da própria igreja. Abrir a carteirinha pelo link e
 * verificar pelo QR Code não exigem login.
 */

export interface CarteirinhaActor {
  companyId: string;
  role: RoleCode;
  /** Módulo "membros" liberado por um cargo da pessoa. */
  liberado: boolean;
}

export function canCarteirinha(role: RoleCode, liberado: boolean): boolean {
  return role === "owner" || role === "admin" || liberado;
}

export interface CarteirinhaRepository {
  getChurch(companyId: string): Promise<{ id: string; name: string } | null>;
  /** Consentimento do membro e o caminho da foto; null sem termo (ou sem acesso). */
  consentimento(membroId: string): Promise<(Consentimento & { fotoPath: string | null; companyId: string }) | null>;
  /** Devolve o caminho da foto a apagar, quando o consentimento da foto saiu. */
  salvarConsentimento(membroId: string, input: ConsentimentoInput): Promise<string | null>;
  /** Liga (ou tira, com null) a foto; devolve o caminho anterior. */
  definirFoto(membroId: string, path: string | null): Promise<string | null>;
  semTermo(churchId: string): Promise<Array<{ id: string; nome: string }>>;
  carteirinha(membroId: string): Promise<CarteirinhaDoMembro | null>;
  /** Devolve o código do QR Code. */
  emitir(membroId: string, tokenHash: string, validade: string): Promise<string>;
  cancelar(membroId: string): Promise<void>;
  porToken(token: string): Promise<Carteirinha | null>;
  /** Caminho da foto pelo link pessoal (só o servidor consegue chamar). */
  fotoPathPorToken(token: string): Promise<string | null>;
  verificar(codigo: string): Promise<VerificacaoCarteirinha | null>;
}

/** O bucket privado das fotos, acessado só pelo servidor. */
export interface FotoStorage {
  upload(params: { path: string; content: Uint8Array; contentType: string }): Promise<{ path: string }>;
  remove(path: string): Promise<void>;
  download(path: string): Promise<Uint8Array | null>;
}

const dataISO = (mensagem: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, mensagem)
    .refine((d) => !Number.isNaN(Date.parse(d)), mensagem);

function consentimentoSchema(hoje: string) {
  return z
    .object({
      cadastro: z.boolean(),
      foto: z.boolean(),
      carteirinha: z.boolean(),
      assinadoEm: dataISO("Informe a data em que o termo foi assinado")
        .refine((d) => d <= hoje, "A data da assinatura não pode ser no futuro")
        .nullish()
        .transform((v) => v || null),
      responsavelNome: z
        .string()
        .trim()
        .max(120, "Nome do responsável longo demais")
        .nullish()
        .transform((v) => v || null)
        .refine((v) => v === null || v.length >= 2, "Nome do responsável curto demais"),
    })
    .refine((v) => !v.cadastro || v.assinadoEm !== null, {
      message: "Informe a data em que o termo foi assinado",
      path: ["assinadoEm"],
    });
}

/** Token do link, como o `makeUrlToken` gera (32 bytes em base64url). */
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Cinco anos: o mesmo teto do banco. */
const VALIDADE_MAX_DIAS = 1830;

export function createCarteirinhaService(deps: {
  repo: CarteirinhaRepository;
  storage: FotoStorage;
  tokens: { make(): string; hash(token: string): string };
  novoId: () => string;
  hoje: () => string;
  log?: { error(message: string, meta?: unknown): void };
}) {
  const { repo, storage, tokens, novoId, hoje } = deps;
  const log = deps.log ?? console;

  function exige(actor: CarteirinhaActor) {
    if (!canCarteirinha(actor.role, actor.liberado)) {
      throw new AppError("forbidden", "Você não tem acesso aos membros desta igreja.");
    }
  }

  const uuid = (valor: string) => {
    if (!z.uuid().safeParse(valor).success) throw new AppError("not_found", "Membro não encontrado.");
  };

  /**
   * O termo do membro, só se ele for da igreja ATIVA de quem pede. A RLS já
   * esconde o de outra rede; isto cobre quem tem acesso a mais de uma igreja e
   * está com outra selecionada.
   */
  async function termoDe(actor: CarteirinhaActor, membroId: string) {
    const c = await repo.consentimento(membroId);
    return c && c.companyId === actor.companyId ? c : null;
  }

  /** Apagar o arquivo antigo não pode derrubar a ação: o vínculo já saiu do banco. */
  async function apagarArquivo(path: string | null) {
    if (!path) return;
    await storage.remove(path).catch((err) => log.error("[foto] falha ao apagar o arquivo", err));
  }

  return {
    // ---------------------------------------------------------- consentimento
    async consentimento(actor: CarteirinhaActor, membroId: string): Promise<Consentimento | null> {
      exige(actor);
      uuid(membroId);
      const c = await termoDe(actor, membroId);
      if (!c) return null;
      return {
        cadastro: c.cadastro,
        foto: c.foto,
        carteirinha: c.carteirinha,
        assinadoEm: c.assinadoEm,
        responsavelNome: c.responsavelNome,
        temFoto: c.temFoto,
      };
    },

    /**
     * Registra o que o membro marcou no termo assinado. Desmarcar a foto apaga
     * a foto; desmarcar a carteirinha cancela a carteirinha (o banco faz as
     * duas coisas na mesma transação; aqui só sai o arquivo).
     */
    async registrarConsentimento(actor: CarteirinhaActor, membroId: string, input: unknown): Promise<void> {
      exige(actor);
      uuid(membroId);
      const parsed = consentimentoSchema(hoje()).safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dados = parsed.data;
      // Foto e carteirinha pressupõem o cadastro.
      const limpo: ConsentimentoInput = dados.cadastro
        ? dados
        : { cadastro: false, foto: false, carteirinha: false, assinadoEm: null, responsavelNome: null };
      await apagarArquivo(await repo.salvarConsentimento(membroId, limpo));
    },

    /** Membros ativos que ainda não têm termo registrado. */
    async semTermo(actor: CarteirinhaActor): Promise<Array<{ id: string; nome: string }>> {
      exige(actor);
      const church = await repo.getChurch(actor.companyId);
      if (!church) throw new AppError("not_found", "Igreja não encontrada.");
      return repo.semTermo(church.id);
    },

    // -------------------------------------------------------------------- foto
    /**
     * Guarda a foto do membro. O tipo vem dos bytes (JPEG ou PNG), nunca do
     * que o navegador diz; sem o consentimento da foto, nem é enviada.
     */
    async enviarFoto(actor: CarteirinhaActor, membroId: string, bytes: Uint8Array): Promise<void> {
      exige(actor);
      uuid(membroId);
      const c = await termoDe(actor, membroId);
      if (!c)
        throw new AppError("validation_error", "Registre o termo de consentimento do membro antes de enviar a foto.");
      if (!c.foto)
        throw new AppError("validation_error", "O membro não autorizou o uso da foto no termo de consentimento.");
      if (bytes.length === 0) throw new AppError("validation_error", "Escolha uma foto.");
      if (bytes.length > MAX_FOTO_BYTES) throw new AppError("validation_error", "A foto passou de 1 MB.");
      const tipo = sniffImageType(bytes);
      if (tipo !== "image/jpeg" && tipo !== "image/png") {
        throw new AppError("validation_error", "Use uma foto em JPG ou PNG.");
      }

      const path = `${c.companyId}/${membroId}/${novoId()}.${EXTENSAO_POR_TIPO[tipo]}`;
      await storage.upload({ path, content: bytes, contentType: tipo });
      let anterior: string | null;
      try {
        anterior = await repo.definirFoto(membroId, path);
      } catch (err) {
        // O banco recusou: o arquivo que acabou de subir não fica órfão.
        await apagarArquivo(path);
        throw err;
      }
      if (anterior !== path) await apagarArquivo(anterior);
    },

    async removerFoto(actor: CarteirinhaActor, membroId: string): Promise<void> {
      exige(actor);
      uuid(membroId);
      const c = await termoDe(actor, membroId);
      if (!c?.fotoPath) return;
      await apagarArquivo(await repo.definirFoto(membroId, null));
    },

    /** A foto, para a ficha. A leitura do consentimento passa pela RLS: membro de outra igreja não vem. */
    async foto(actor: CarteirinhaActor, membroId: string): Promise<FotoMembro | null> {
      exige(actor);
      uuid(membroId);
      const c = await termoDe(actor, membroId);
      if (!c?.fotoPath) return null;
      return lerFoto(c.fotoPath);
    },

    // -------------------------------------------------------------- carteirinha
    async carteirinha(actor: CarteirinhaActor, membroId: string): Promise<CarteirinhaDoMembro | null> {
      exige(actor);
      uuid(membroId);
      return repo.carteirinha(membroId);
    },

    /**
     * Emite (ou renova) a carteirinha e gera um link pessoal novo. O link
     * anterior deixa de abrir; o QR Code continua o mesmo. O link só existe
     * nesta resposta: o banco guarda o hash.
     */
    async emitir(
      actor: CarteirinhaActor,
      membroId: string,
      validade: unknown,
    ): Promise<{ token: string; codigo: string }> {
      exige(actor);
      uuid(membroId);
      const parsed = dataISO("Informe a validade").safeParse(validade);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const dias = Math.round((Date.parse(parsed.data) - Date.parse(hoje())) / 86_400_000);
      if (dias <= 0) throw new AppError("validation_error", "A validade precisa ser depois de hoje.");
      if (dias > VALIDADE_MAX_DIAS) throw new AppError("validation_error", "A validade máxima é de 5 anos.");

      const c = await termoDe(actor, membroId);
      if (!c?.carteirinha) {
        throw new AppError("validation_error", "O membro não autorizou a carteirinha no termo de consentimento.");
      }
      const token = tokens.make();
      const codigo = await repo.emitir(membroId, tokens.hash(token), parsed.data);
      return { token, codigo };
    },

    async cancelar(actor: CarteirinhaActor, membroId: string): Promise<void> {
      exige(actor);
      uuid(membroId);
      await repo.cancelar(membroId);
    },

    // ------------------------------------------------------- sem login (público)
    /** A carteirinha pelo link pessoal. Link malformado, trocado ou cancelado: null. */
    async porToken(token: unknown): Promise<Carteirinha | null> {
      const parsed = tokenSchema.safeParse(token);
      return parsed.success ? repo.porToken(parsed.data) : null;
    },

    async fotoPorToken(token: unknown): Promise<FotoMembro | null> {
      const parsed = tokenSchema.safeParse(token);
      if (!parsed.success) return null;
      const path = await repo.fotoPathPorToken(parsed.data);
      return path ? lerFoto(path) : null;
    },

    /** O que o QR Code mostra. Código desconhecido ou malformado: null. */
    async verificar(codigo: unknown): Promise<VerificacaoCarteirinha | null> {
      if (typeof codigo !== "string" || !CODIGO_RE.test(codigo.trim())) return null;
      return repo.verificar(codigo.trim().toUpperCase());
    },
  };

  async function lerFoto(path: string): Promise<FotoMembro | null> {
    const bytes = await storage.download(path);
    if (!bytes) return null;
    const tipo = sniffImageType(bytes);
    return tipo === "image/jpeg" || tipo === "image/png" ? { bytes, tipo } : null;
  }
}

export type CarteirinhaService = ReturnType<typeof createCarteirinhaService>;
