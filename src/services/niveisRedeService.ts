import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";
import { NIVEIS, NOMES_PADRAO, NOME_NIVEL_MAX, NOME_NIVEL_MIN, type NomesNiveis } from "@/lib/niveisRede";
import type { ChurchTipo, RoleCode } from "@/types/database";

/**
 * Nomes dos níveis da rede (sede, subsede, congregação), que a sede pode
 * trocar. Ler vale para qualquer igreja da rede; gravar é só do Responsável
 * da sede — o banco confere de novo (função salvar_nomes_dos_niveis).
 */

export interface NiveisRedeRepository {
  /** Nomes gravados para a rede desta igreja; null = a rede usa o padrão. */
  get(churchId: string): Promise<NomesNiveis | null>;
  /** `nomes` null restaura o padrão. */
  save(churchId: string, nomes: NomesNiveis | null): Promise<void>;
  /** Igreja da empresa (a pedida, ou a primeira). Null se não é desta empresa. */
  igrejaDaEmpresa(companyId: string, churchId?: string): Promise<IgrejaDaRede | null>;
}

export interface NiveisRedeActor {
  role: RoleCode;
}

/** A igreja em que a pessoa está, do jeito que importa para esta regra. */
export interface IgrejaDaRede {
  id: string;
  tipo: ChurchTipo;
  parentId: string | null;
}

/** Só o Responsável da sede (igreja do topo, do tipo sede) troca os nomes. */
export function podeNomearNiveis(role: RoleCode, igreja: Pick<IgrejaDaRede, "tipo" | "parentId">): boolean {
  return role === "owner" && igreja.tipo === "sede" && igreja.parentId === null;
}

const nome = (rotulo: string) =>
  z
    .string()
    .trim()
    // Espaços repetidos viram um só: o nome vai para badge e meio de frase.
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(NOME_NIVEL_MIN, `${rotulo}: pelo menos ${NOME_NIVEL_MIN} letras`)
        .max(NOME_NIVEL_MAX, `${rotulo}: no máximo ${NOME_NIVEL_MAX} letras`)
        // Letras, números, espaço, hífen e ponto: é um rótulo, não um texto livre.
        .regex(/^[\p{L}\p{N} .\-]+$/u, `${rotulo}: use só letras, números, espaço e hífen`),
    );

const nivel = (n: number) =>
  z.object({ singular: nome(`Nível ${n} (singular)`), plural: nome(`Nível ${n} (plural)`) });

const nomesSchema = z
  .object({ sede: nivel(1), subsede: nivel(2), congregacao: nivel(3) })
  .superRefine((nomes, ctx) => {
    // Dois níveis com o mesmo nome deixam a tela ambígua ("Filial de Filial").
    const vistos = new Set<string>();
    for (const n of NIVEIS) {
      const chave = nomes[n].singular.toLocaleLowerCase("pt-BR");
      if (vistos.has(chave)) {
        ctx.addIssue({ code: "custom", path: [n, "singular"], message: "Cada nível precisa de um nome diferente" });
      }
      vistos.add(chave);
    }
  });

export function createNiveisRedeService(repo: NiveisRedeRepository) {
  function exigePermissao(actor: NiveisRedeActor, igreja: IgrejaDaRede) {
    if (!podeNomearNiveis(actor.role, igreja)) {
      throw new AppError("forbidden", "Só o Responsável da sede define os nomes dos níveis da rede.");
    }
  }

  return {
    /** A igreja da empresa, para saber de qual rede são os nomes e quem pode trocá-los. */
    async igrejaDaEmpresa(companyId: string, churchId?: string): Promise<IgrejaDaRede | null> {
      try {
        return await repo.igrejaDaEmpresa(companyId, churchId);
      } catch (err) {
        console.error("[niveis] falha ao carregar a igreja da empresa", err);
        return null;
      }
    },

    /**
     * Os nomes que valem para a rede desta igreja. Nunca falha a tela por
     * causa de um rótulo: erro ao carregar cai no padrão.
     */
    async nomesDaRede(churchId: string | null | undefined): Promise<NomesNiveis> {
      if (!churchId) return NOMES_PADRAO;
      try {
        return (await repo.get(churchId)) ?? NOMES_PADRAO;
      } catch (err) {
        console.error("[niveis] falha ao carregar os nomes dos níveis; usando o padrão", err);
        return NOMES_PADRAO;
      }
    },

    async salvar(actor: NiveisRedeActor, igreja: IgrejaDaRede, input: unknown): Promise<NomesNiveis> {
      exigePermissao(actor, igreja);
      const parsed = nomesSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      await repo.save(igreja.id, parsed.data);
      return parsed.data;
    },

    async restaurarPadrao(actor: NiveisRedeActor, igreja: IgrejaDaRede): Promise<void> {
      exigePermissao(actor, igreja);
      await repo.save(igreja.id, null);
    },
  };
}

export type NiveisRedeService = ReturnType<typeof createNiveisRedeService>;
