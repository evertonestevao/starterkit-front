import { z } from "zod";
import {
  camposDesconhecidos,
  dadosDeExemplo,
  exigeDestino,
  aceitaDestino,
  isTipoDocumento,
  montarDocumento,
  resolverModelos,
  type DadosDoDocumento,
} from "@/lib/documentosMembro";
import { AppError, toValidationError } from "@/lib/errors";
import type { RoleCode } from "@/types/database";
import type {
  DocumentoPronto,
  HistoricoItem,
  IgrejaDoDocumento,
  MembroDoDocumento,
  ModeloDocumento,
  ModeloGravado,
  TipoDocumento,
} from "@/types/secretaria";

/**
 * Secretaria: o histórico do membro (situação, anotações, documentos emitidos)
 * e os documentos (declaração, carta de recomendação e de transferência).
 *
 * É do módulo Membros: quem administra a igreja ou tem o módulo liberado pelo
 * cargo. O MODELO dos documentos só quem administra altera. O banco repete as
 * duas regras, e só para a própria igreja.
 */

export interface SecretariaActor {
  companyId: string;
  role: RoleCode;
  /** Módulo "membros" liberado por um cargo da pessoa. */
  liberado: boolean;
}

export function canSecretaria(role: RoleCode, liberado: boolean): boolean {
  return role === "owner" || role === "admin" || liberado;
}

export function canEditarModelos(role: RoleCode): boolean {
  return role === "owner" || role === "admin";
}

export interface SecretariaRepository {
  getChurch(companyId: string): Promise<{ id: string; name: string } | null>;
  historico(membroId: string): Promise<HistoricoItem[]>;
  anotar(membroId: string, input: { titulo: string; detalhe: string | null; data: string | null }): Promise<string>;
  excluirAnotacao(id: string): Promise<void>;
  /** Modelos gravados que valem para a igreja (o dela ou o da mais próxima acima). */
  modelosVigentes(churchId: string): Promise<ModeloGravado[]>;
  salvarModelo(churchId: string, tipo: TipoDocumento, titulo: string, corpo: string): Promise<void>;
  restaurarModelo(churchId: string, tipo: TipoDocumento): Promise<void>;
  dadosDaIgreja(churchId: string): Promise<IgrejaDoDocumento | null>;
  registrarEmissao(membroId: string, tipo: TipoDocumento, destino: string | null): Promise<void>;
}

const anotacaoSchema = (hoje: string) =>
  z.object({
    titulo: z.string().trim().min(2, "Descreva o que aconteceu").max(160, "Título longo demais"),
    detalhe: z
      .string()
      .trim()
      .max(500, "Detalhe longo demais")
      .nullish()
      .transform((v) => v || null),
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
      .refine((d) => !Number.isNaN(Date.parse(d)), "Data inválida")
      .refine((d) => d <= hoje, "A data não pode ser no futuro")
      .nullish()
      .transform((v) => v || null),
  });

const modeloSchema = z.object({
  titulo: z.string().trim().min(3, "Informe o título do documento").max(120, "Título longo demais"),
  corpo: z.string().trim().min(20, "O texto está curto demais").max(4000, "O texto passou de 4.000 caracteres"),
});

const destinoSchema = z
  .string()
  .trim()
  .max(160, "Nome da igreja de destino longo demais")
  .nullish()
  .transform((v) => v || null);

export function createSecretariaService(deps: { repo: SecretariaRepository; hoje: () => string }) {
  const { repo, hoje } = deps;

  function exige(actor: SecretariaActor) {
    if (!canSecretaria(actor.role, actor.liberado)) {
      throw new AppError("forbidden", "Você não tem acesso aos membros desta igreja.");
    }
  }

  async function igreja(actor: SecretariaActor) {
    exige(actor);
    const church = await repo.getChurch(actor.companyId);
    if (!church) throw new AppError("not_found", "Igreja não encontrada.");
    return church;
  }

  const uuid = (valor: string, oQue: string) => {
    if (!z.uuid().safeParse(valor).success) throw new AppError("not_found", `${oQue} não encontrado.`);
  };

  function tipoValido(tipo: unknown): TipoDocumento {
    if (!isTipoDocumento(tipo)) throw new AppError("validation_error", "Documento desconhecido.");
    return tipo;
  }

  async function modelosDa(churchId: string): Promise<ModeloDocumento[]> {
    return resolverModelos(await repo.modelosVigentes(churchId), churchId);
  }

  async function dadosDaIgreja(churchId: string): Promise<IgrejaDoDocumento> {
    const dados = await repo.dadosDaIgreja(churchId);
    if (!dados) throw new AppError("not_found", "Igreja não encontrada.");
    return dados;
  }

  return {
    // --------------------------------------------------------------- histórico
    async historico(actor: SecretariaActor, membroId: string): Promise<HistoricoItem[]> {
      exige(actor);
      uuid(membroId, "Membro");
      return repo.historico(membroId);
    },

    /** Fato anotado à mão (consagração, disciplina, retorno...). */
    async anotar(actor: SecretariaActor, membroId: string, input: unknown): Promise<string> {
      exige(actor);
      uuid(membroId, "Membro");
      const parsed = anotacaoSchema(hoje()).safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      return repo.anotar(membroId, parsed.data);
    },

    /** Só a anotação à mão sai; o que o sistema registrou fica (o banco recusa). */
    async excluirAnotacao(actor: SecretariaActor, id: string): Promise<void> {
      exige(actor);
      uuid(id, "Registro");
      await repo.excluirAnotacao(id);
    },

    // ----------------------------------------------------------------- modelos
    /** O texto que vale para cada documento, e de onde ele vem. */
    async modelos(actor: SecretariaActor): Promise<ModeloDocumento[]> {
      return modelosDa((await igreja(actor)).id);
    },

    async salvarModelo(actor: SecretariaActor, tipo: unknown, input: unknown): Promise<void> {
      const church = await igreja(actor);
      if (!canEditarModelos(actor.role)) {
        throw new AppError("forbidden", "Só quem administra a igreja altera o texto dos documentos.");
      }
      const t = tipoValido(tipo);
      const parsed = modeloSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const estranhos = [...camposDesconhecidos(parsed.data.titulo), ...camposDesconhecidos(parsed.data.corpo)];
      if (estranhos.length > 0) {
        throw new AppError(
          "validation_error",
          `Campo desconhecido no texto: ${estranhos.map((c) => `{${c}}`).join(", ")}. Use só os campos da lista.`,
        );
      }
      await repo.salvarModelo(church.id, t, parsed.data.titulo, parsed.data.corpo);
    },

    /** Volta ao modelo da igreja de cima, ou ao padrão. */
    async restaurarModelo(actor: SecretariaActor, tipo: unknown): Promise<void> {
      const church = await igreja(actor);
      if (!canEditarModelos(actor.role)) {
        throw new AppError("forbidden", "Só quem administra a igreja altera o texto dos documentos.");
      }
      await repo.restaurarModelo(church.id, tipoValido(tipo));
    },

    // -------------------------------------------------------------- documentos
    /** O que a tela precisa para oferecer os documentos de um membro: modelos e quem assina. */
    async paraEmitir(actor: SecretariaActor): Promise<{ modelos: ModeloDocumento[]; igreja: IgrejaDoDocumento }> {
      const church = await igreja(actor);
      const [modelos, dados] = await Promise.all([modelosDa(church.id), dadosDaIgreja(church.id)]);
      return { modelos, igreja: dados };
    },

    /**
     * Monta o documento do membro e registra a emissão no histórico dele. Os
     * dados do membro vêm de quem chama (que já os leu com a permissão da
     * pessoa); o registro no histórico confere de novo, no banco, que o membro
     * é desta igreja.
     */
    async emitir(
      actor: SecretariaActor,
      membroId: string,
      membro: MembroDoDocumento,
      pedido: { tipo: unknown; destino: unknown },
    ): Promise<DocumentoPronto> {
      const church = await igreja(actor);
      uuid(membroId, "Membro");
      const tipo = tipoValido(pedido.tipo);
      const destino = destinoSchema.safeParse(pedido.destino);
      if (!destino.success) throw toValidationError(destino.error.issues);
      const para = aceitaDestino(tipo) ? destino.data : null;
      if (exigeDestino(tipo) && !para) {
        throw new AppError("validation_error", "Informe a igreja de destino da carta de transferência.");
      }

      const [modelos, dados] = await Promise.all([modelosDa(church.id), dadosDaIgreja(church.id)]);
      const modelo = modelos.find((m) => m.tipo === tipo)!;
      const documento = montarDocumento(modelo, { membro, igreja: dados, destino: para, hoje: hoje() });
      await repo.registrarEmissao(membroId, tipo, para);
      return documento;
    },

    /** O modelo com um membro de mentira, para conferir como fica impresso. Não registra nada. */
    async exemplo(actor: SecretariaActor, tipo: unknown): Promise<DocumentoPronto> {
      const church = await igreja(actor);
      const t = tipoValido(tipo);
      const [modelos, dados] = await Promise.all([modelosDa(church.id), dadosDaIgreja(church.id)]);
      const exemplo: DadosDoDocumento = dadosDeExemplo(dados, hoje());
      return montarDocumento(
        modelos.find((m) => m.tipo === t)!,
        exemplo,
      );
    },
  };
}

export type SecretariaService = ReturnType<typeof createSecretariaService>;
