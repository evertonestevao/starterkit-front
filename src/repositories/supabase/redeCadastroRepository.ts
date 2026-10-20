import type { ChurchTipo } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type {
  ContasDoServidor,
  ConviteResponsavel,
  EstadoConvite,
  IgrejaAguardando,
  RedeCadastroRepository,
  TipoCadastrado,
} from "@/services/redeCadastroService";

/**
 * Cadastro de igrejas pela rede e o convite para assumir: tudo pelas funções
 * do banco, com o client do usuário (quem pode o quê o banco confere).
 */
export function createSupabaseRedeCadastroRepository(client: SupabaseClient): RedeCadastroRepository {
  return {
    async cadastrar({ maeId, tipo, nome, sobrenome, slug }) {
      const { data, error } = await client.rpc("cadastrar_igreja_da_rede", {
        p_parent_church_id: maeId,
        p_tipo: tipo,
        p_nome: nome,
        p_sobrenome: sobrenome,
        p_slug: slug,
      });
      if (error) {
        if (error.code === "23505") throw new AppError("conflict", "Endereço repetido", error);
        if (error.code === "P0002") throw new AppError("not_found", "Igreja não encontrada.", error);
        if (error.code === "22023" || error.code === "23514") {
          throw new AppError(
            "validation_error",
            "Esta igreja não pode cadastrar esse tipo de igreja abaixo dela.",
            error,
          );
        }
        throw new AppError("internal_error", "Falha ao cadastrar a igreja", error);
      }
      return data as string;
    },

    async convidar({ churchId, tokenHash, email, nome, cargo, whatsapp, validadeHoras, substituir }) {
      const { data, error } = await client.rpc("convidar_responsavel", {
        p_church_id: churchId,
        p_token_hash: tokenHash,
        p_email: email,
        p_nome: nome,
        p_cargo: cargo ?? "",
        p_whatsapp: whatsapp ?? "",
        p_validade_horas: validadeHoras,
        p_substituir: substituir,
      });
      if (error) {
        if (error.code === "P0002") {
          throw new AppError(
            "not_found",
            "Esta igreja já tem responsável: só o Responsável da igreja de cima convida um novo.",
            error,
          );
        }
        if (error.code === "23514")
          throw new AppError("validation_error", "Confira o nome, o e-mail e o WhatsApp.", error);
        throw new AppError("internal_error", "Falha ao gerar o convite", error);
      }
      return data as string;
    },

    async editar(churchId, { nome, sobrenome, sobre, endereco, address }) {
      const { error } = await client.rpc("editar_igreja_aguardando", {
        p_church_id: churchId,
        p: { nome, sobrenome, sobre, address, ...endereco },
      });
      if (error) {
        if (error.code === "P0002")
          throw new AppError("not_found", "Esta igreja já tem responsável: só ela edita agora.", error);
        if (error.code === "23514")
          throw new AppError("validation_error", "Algum campo está fora do permitido.", error);
        throw new AppError("internal_error", "Falha ao salvar os dados da igreja", error);
      }
    },

    async aguardando(maeId) {
      const { data, error } = await client.rpc("igrejas_aguardando_responsavel", { p_church_id: maeId });
      if (error) throw new AppError("internal_error", "Falha ao carregar as igrejas aguardando", error);
      return (
        (data ?? []) as Array<{
          church_id: string;
          church_name: string;
          nome_proprio: string;
          sobrenome: string | null;
          tipo: TipoCadastrado;
          created_at: string;
          sobre: string | null;
          cep: string | null;
          logradouro: string | null;
          numero: string | null;
          complemento: string | null;
          bairro: string | null;
          cidade: string | null;
          uf: string | null;
          convite_nome: string | null;
          convite_email: string | null;
          convite_expira: string | null;
        }>
      ).map((r): IgrejaAguardando => ({
        churchId: r.church_id,
        nome: r.church_name,
        nomeProprio: r.nome_proprio,
        sobrenome: r.sobrenome,
        sobre: r.sobre,
        endereco: {
          cep: r.cep,
          logradouro: r.logradouro,
          numero: r.numero,
          complemento: r.complemento,
          bairro: r.bairro,
          cidade: r.cidade,
          uf: r.uf,
        },
        tipo: r.tipo,
        criadaEm: r.created_at,
        convite:
          r.convite_email && r.convite_expira
            ? {
                nome: r.convite_nome ?? "",
                email: r.convite_email,
                expiraEm: r.convite_expira,
              }
            : null,
      }));
    },

    async consultarConvite(token) {
      const { data, error } = await client.rpc("convite_responsavel_por_token", { p_token: token });
      if (error) throw new AppError("internal_error", "Falha ao abrir o convite", error);
      const r = (
        (data ?? []) as Array<{
          estado: EstadoConvite;
          church_name: string;
          tipo: string;
          mae_name: string | null;
          email: string | null;
          nome: string;
          substituir: boolean | null;
        }>
      )[0];
      if (!r) return null;
      const convite: ConviteResponsavel = {
        estado: r.estado,
        igreja: r.church_name,
        tipo: r.tipo,
        mae: r.mae_name,
        email: r.email,
        nome: r.nome,
        substituir: Boolean(r.substituir),
      };
      return convite;
    },

    async aceitar(token) {
      const { data, error } = await client.rpc("aceitar_responsavel", {
        p_token: token,
      });
      if (error) {
        if (error.code === "P0002") {
          throw new AppError("not_found", "Este convite não vale mais. Peça um novo a quem cadastrou a igreja.", error);
        }
        if (error.code === "42501") {
          throw new AppError(
            "forbidden",
            "Este convite é para outro e-mail. Saia e entre com o e-mail do convite.",
            error,
          );
        }
        throw new AppError("internal_error", "Falha ao assumir a igreja", error);
      }
      const r = (
        (data ?? []) as Array<{
          company_id: string;
          church_name: string;
          removidos: string[] | null;
        }>
      )[0];
      if (!r) throw new AppError("internal_error", "Falha ao assumir a igreja");
      return {
        companyId: r.company_id,
        igreja: r.church_name,
        removidos: r.removidos ?? [],
      };
    },

    async responsaveis(maeId) {
      const { data, error } = await client.rpc("responsaveis_da_rede", {
        p_church_id: maeId,
      });
      if (error) throw new AppError("internal_error", "Falha ao carregar os responsáveis da rede", error);
      return (
        (data ?? []) as Array<{
          church_id: string;
          church_name: string;
          tipo: ChurchTipo;
          member_id: string;
          nome: string;
          email: string;
          desde: string | null;
        }>
      ).map((r) => ({
        churchId: r.church_id,
        igreja: r.church_name,
        tipo: r.tipo,
        memberId: r.member_id,
        nome: r.nome,
        email: r.email,
        desde: r.desde,
      }));
    },

    async remover(memberId) {
      const { data, error } = await client.rpc("remover_responsavel_abaixo", {
        p_member_id: memberId,
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Responsável não encontrado.", error);
        throw new AppError("internal_error", "Falha ao remover o responsável", error);
      }
      const r = (
        (data ?? []) as Array<{
          email: string | null;
          ficou_sem_responsavel: boolean;
          church_name: string;
        }>
      )[0];
      if (!r) throw new AppError("internal_error", "Falha ao remover o responsável");
      return {
        email: r.email,
        ficouSemResponsavel: r.ficou_sem_responsavel,
        igreja: r.church_name,
      };
    },
  };
}

/**
 * Primeiro acesso de quem foi convidado: só o servidor (service_role) cria a
 * conta, já confirmada — o link pessoal do convite prova que é a pessoa — e
 * só depois de o serviço conferir convite válido, e-mail sem conta e senha
 * forte. A sessão é gravada com o client do usuário (cookies do navegador).
 */
export function createSupabaseContasDoServidor(admin: SupabaseClient, client: SupabaseClient): ContasDoServidor {
  return {
    async contaExiste(email) {
      const { data, error } = await admin.rpc("conta_existe_para_email", {
        p_email: email,
      });
      if (error) throw new AppError("internal_error", "Falha ao conferir a conta", error);
      return data === true;
    },

    async criarConta({ email, senha, nome }) {
      const { error } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { full_name: nome },
      });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) {
          throw new AppError("conflict", "Este e-mail já tem conta. Entre com a sua senha para assumir.", error);
        }
        if (/password/i.test(error.message))
          throw new AppError("validation_error", "Senha fraca. Use letras, números e símbolo.", error, "senha");
        throw new AppError("internal_error", "Falha ao criar a conta", error);
      }
    },

    async entrar(email, senha) {
      const { error } = await client.auth.signInWithPassword({
        email,
        password: senha,
      });
      if (error)
        throw new AppError(
          "internal_error",
          "Conta criada, mas não foi possível entrar. Tente entrar pela tela de login.",
          error,
        );
    },
  };
}
