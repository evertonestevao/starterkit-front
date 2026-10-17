import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CarteirinhaRepository } from "@/services/carteirinhaService";
import { isCampo, isLayout } from "@/lib/carteirinhaModelo";
import type {
  Carteirinha,
  CarteirinhaDoMembro,
  CarteirinhaModelo,
  EstadoCarteirinha,
  VerificacaoCarteirinha,
} from "@/types/carteirinha";

interface CarteirinhaRow {
  nome: string;
  cargos: string | null;
  igreja: string;
  igreja_sobrenome: string | null;
  pastor: string | null;
  membro_desde: string | null;
  batismo: string | null;
  nascimento: string | null;
  estado_civil: string | null;
  validade: string;
  codigo: string;
  estado: EstadoCarteirinha;
  tem_foto: boolean;
  logo_url: string | null;
  modelo: ModeloRow | null;
}

interface ModeloRow {
  layout: string | null;
  cor_primaria: string | null;
  cor_destaque: string | null;
  titulo: string | null;
  campos: string[] | null;
  rodape: string | null;
  texto_verso: string | null;
  mostrar_logo: boolean | null;
}

/** Modelo gravado → tipo da aplicação. Linha sem desenho ou cor (padrão) vira null. */
function toModelo(r: ModeloRow | null): CarteirinhaModelo | null {
  if (!r || !isLayout(r.layout) || !r.cor_primaria || !r.cor_destaque) return null;
  return {
    layout: r.layout,
    corPrimaria: r.cor_primaria,
    corDestaque: r.cor_destaque,
    titulo: r.titulo ?? "",
    campos: (r.campos ?? []).filter(isCampo),
    rodape: r.rodape,
    textoVerso: r.texto_verso,
    mostrarLogo: r.mostrar_logo ?? true,
  };
}

const toCarteirinha = (r: CarteirinhaRow): Carteirinha => ({
  nome: r.nome,
  cargos: r.cargos,
  igreja: r.igreja,
  igrejaSobrenome: r.igreja_sobrenome,
  pastor: r.pastor,
  membroDesde: r.membro_desde,
  batismo: r.batismo,
  nascimento: r.nascimento,
  estadoCivil: r.estado_civil,
  modelo: toModelo(r.modelo),
  logoUrl: r.logo_url,
  validade: r.validade,
  codigo: r.codigo,
  estado: r.estado,
  temFoto: r.tem_foto,
});

/**
 * Consentimento, foto e carteirinha. `client` é o do usuário (RLS ativa) ou o
 * anônimo, nas páginas do link e do QR Code. `admin` (service_role) entra só
 * para achar a foto pelo link pessoal: essa função não é executável por quem
 * abre a página, de propósito — quem entrega a imagem é o servidor.
 */
export function createSupabaseCarteirinhaRepository(
  client: SupabaseClient,
  admin?: SupabaseClient,
): CarteirinhaRepository {
  return {
    async getChurch(companyId) {
      const { data, error } = await client
        .from("churches")
        .select("id, name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at")
        .limit(1)
        .maybeSingle<{ id: string; name: string }>();
      if (error) throw new AppError("internal_error", "Falha ao carregar a igreja", error);
      return data;
    },

    async consentimento(membroId) {
      const { data, error } = await client
        .from("rol_membro_consentimentos")
        .select("company_id, church_id, cadastro, foto, carteirinha, assinado_em, responsavel_nome, foto_path")
        .eq("membro_id", membroId)
        .is("deleted_at", null)
        .maybeSingle<{
          company_id: string;
          church_id: string;
          cadastro: boolean;
          foto: boolean;
          carteirinha: boolean;
          assinado_em: string | null;
          responsavel_nome: string | null;
          foto_path: string | null;
        }>();
      if (error) throw new AppError("internal_error", "Falha ao carregar o consentimento", error);
      if (!data) return null;
      return {
        companyId: data.company_id,
        churchId: data.church_id,
        cadastro: data.cadastro,
        foto: data.foto,
        carteirinha: data.carteirinha,
        assinadoEm: data.assinado_em,
        responsavelNome: data.responsavel_nome,
        temFoto: data.foto_path !== null,
        fotoPath: data.foto_path,
      };
    },

    async ehAdminDaRede(churchId) {
      const { data, error } = await client.rpc("can_admin_view_church", { p_church_id: churchId });
      if (error) throw new AppError("internal_error", "Falha ao conferir o acesso pela rede", error);
      return data === true;
    },

    async salvarConsentimento(membroId, input) {
      const { data, error } = await client.rpc("salvar_consentimento_membro", {
        p_membro_id: membroId,
        p: {
          cadastro: input.cadastro,
          foto: input.foto,
          carteirinha: input.carteirinha,
          assinado_em: input.assinadoEm ?? "",
          responsavel_nome: input.responsavelNome ?? "",
        },
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Membro não encontrado.");
        if (error.code === "22023" || error.code === "23514") {
          throw new AppError("validation_error", "Confira a data da assinatura e os dados do termo.");
        }
        throw new AppError("internal_error", "Falha ao registrar o consentimento", error);
      }
      return (data as string | null) ?? null;
    },

    async definirFoto(membroId, path) {
      const { data, error } = await client.rpc("definir_foto_membro", { p_membro_id: membroId, p_path: path });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Membro sem termo de consentimento registrado.");
        if (error.code === "42501") {
          throw new AppError("validation_error", "O membro não autorizou o uso da foto no termo de consentimento.");
        }
        throw new AppError("internal_error", "Falha ao guardar a foto", error);
      }
      return (data as string | null) ?? null;
    },

    async semTermo(churchId) {
      const { data, error } = await client.rpc("membros_sem_consentimento", { p_church_id: churchId });
      if (error) throw new AppError("internal_error", "Falha ao listar os membros sem termo", error);
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },

    async carteirinha(membroId) {
      const { data, error } = await client.rpc("carteirinha_do_membro", { p_membro_id: membroId });
      if (error) throw new AppError("internal_error", "Falha ao carregar a carteirinha", error);
      const row = ((data ?? []) as Array<CarteirinhaRow & { tem_link: boolean }>)[0];
      return row ? ({ ...toCarteirinha(row), temLink: row.tem_link } satisfies CarteirinhaDoMembro) : null;
    },

    async emitir(membroId, tokenHash, validade) {
      const { data, error } = await client.rpc("emitir_carteirinha", {
        p_membro_id: membroId,
        p_token_hash: tokenHash,
        p_validade: validade,
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Membro não encontrado.");
        if (error.code === "42501") {
          throw new AppError("validation_error", "O membro não autorizou a carteirinha no termo de consentimento.");
        }
        if (error.code === "22023") {
          throw new AppError("validation_error", "Só membro ativo recebe carteirinha, com validade de até 5 anos.");
        }
        throw new AppError("internal_error", "Falha ao emitir a carteirinha", error);
      }
      return data as string;
    },

    async cancelar(membroId) {
      const { error } = await client.rpc("revogar_carteirinha", { p_membro_id: membroId });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Este membro não tem carteirinha em vigor.");
        throw new AppError("internal_error", "Falha ao cancelar a carteirinha", error);
      }
    },

    async porToken(token) {
      const { data, error } = await client.rpc("carteirinha_por_token", { p_token: token });
      if (error) throw new AppError("internal_error", "Falha ao abrir a carteirinha", error);
      const row = ((data ?? []) as CarteirinhaRow[])[0];
      return row ? toCarteirinha(row) : null;
    },

    async fotoPathPorToken(token) {
      if (!admin) return null;
      const { data, error } = await admin.rpc("carteirinha_foto_por_token", { p_token: token });
      if (error) throw new AppError("internal_error", "Falha ao carregar a foto", error);
      return (data as string | null) ?? null;
    },

    async modeloVigente(churchId) {
      const { data, error } = await client.rpc("carteirinha_modelo_vigente", { p_church_id: churchId });
      if (error) throw new AppError("internal_error", "Falha ao carregar o modelo da carteirinha", error);
      const row = (
        (data ?? []) as Array<
          ModeloRow & {
            origem_church_id: string;
            origem_nome: string;
            pode_editar: boolean;
            logo_url: string | null;
          }
        >
      )[0];
      if (!row) return null;
      return {
        modelo: toModelo(row),
        origemNome: row.origem_nome,
        podeEditar: row.pode_editar,
        logoUrl: row.logo_url,
      };
    },

    async salvarModelo(churchId, modelo) {
      const { error } = await client.rpc("salvar_carteirinha_modelo", {
        p_church_id: churchId,
        p: {
          layout: modelo.layout,
          cor_primaria: modelo.corPrimaria,
          cor_destaque: modelo.corDestaque,
          titulo: modelo.titulo,
          campos: modelo.campos,
          rodape: modelo.rodape ?? "",
          texto_verso: modelo.textoVerso ?? "",
          mostrar_logo: modelo.mostrarLogo,
        },
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Igreja não encontrada.");
        if (error.code === "42501") {
          throw new AppError("forbidden", "O modelo da carteirinha é definido pela sede da rede.");
        }
        if (error.code === "23514") throw new AppError("validation_error", "Confira as cores e os textos do modelo.");
        throw new AppError("internal_error", "Falha ao salvar o modelo da carteirinha", error);
      }
    },

    async restaurarModelo(churchId) {
      const { error } = await client.rpc("restaurar_carteirinha_modelo", { p_church_id: churchId });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Igreja não encontrada.");
        if (error.code === "42501") {
          throw new AppError("forbidden", "O modelo da carteirinha é definido pela sede da rede.");
        }
        throw new AppError("internal_error", "Falha ao restaurar o modelo da carteirinha", error);
      }
    },

    async verificar(codigo) {
      const { data, error } = await client.rpc("verificar_carteirinha", { p_codigo: codigo });
      if (error) throw new AppError("internal_error", "Falha ao verificar a carteirinha", error);
      const row = (
        (data ?? []) as Array<{
          estado: EstadoCarteirinha;
          nome: string | null;
          igreja: string;
          igreja_sobrenome: string | null;
          validade: string | null;
        }>
      )[0];
      if (!row) return null;
      return {
        estado: row.estado,
        nome: row.nome,
        igreja: row.igreja,
        igrejaSobrenome: row.igreja_sobrenome,
        validade: row.validade,
      } satisfies VerificacaoCarteirinha;
    },
  };
}
