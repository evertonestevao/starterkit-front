import type { RoleCode } from "@/types/database";

/**
 * Menus do painel e acessos por cargo. Lógica pura (sem I/O), usada pela
 * sidebar, pela guarda das telas e por Configurações → Acessos.
 *
 * Quem abre um módulo:
 *  - o papel (Responsável/Administrador sempre; Membro, sozinho, só o painel
 *    e as próprias configurações);
 *  - ou um cargo da pessoa com o módulo LIBERADO pela igreja (ou herdado da
 *    igreja acima). O banco repete a regra em tem_acesso().
 */

/** Módulos que o Responsável pode liberar para um cargo. */
export const MODULOS_LIBERAVEIS = [
  "dashboard",
  "acompanhamento",
  "membros",
  "ebd",
  "programacao",
  "events",
  "campaigns",
  "relationships",
] as const;
export type Modulo = (typeof MODULOS_LIBERAVEIS)[number];

export function isModulo(valor: string): valor is Modulo {
  return (MODULOS_LIBERAVEIS as readonly string[]).includes(valor);
}

export interface MenuDef {
  /** Chave estável; nos módulos liberáveis é a mesma gravada em cargo_acessos.modulo. */
  key: string;
  title: string;
  href: string;
  /** Papéis que abrem o menu sem depender de cargo. */
  roles: RoleCode[];
}

/**
 * Catálogo dos menus do painel — editar aqui ao adicionar um módulo.
 *
 * Financeiro e Presença digital existem como rota (/dashboard/finance,
 * /presence) mas estão FORA do menu: as duas ainda são maquete, com números
 * fixos no arquivo. Voltam quando lerem o banco — é só devolver o item aqui.
 */
export const MENUS: readonly MenuDef[] = [
  // O painel: liberável por cargo. Cada número dele ainda depende do módulo de onde vem.
  { key: "dashboard", title: "Painel", href: "/dashboard", roles: ["owner", "admin"] },
  // Chamada nos cultos, justificativas e quem está faltando. Dado pessoal:
  // só a própria igreja; a RLS repete a regra (can_acompanhar).
  { key: "acompanhamento", title: "Presença nos cultos", href: "/dashboard/acompanhamento", roles: ["owner", "admin"] },
  // As pessoas da igreja. O login de cada uma é gerenciado na ficha, só por
  // quem administra.
  { key: "membros", title: "Membros", href: "/dashboard/membros", roles: ["owner", "admin"] },
  // Escola Bíblica Dominical. O professor entra só nas classes dele (a RLS
  // repete: can_ebd_classe).
  { key: "ebd", title: "EBD", href: "/dashboard/ebd", roles: ["owner", "admin"] },
  // Dado sensível (LGPD): o texto do pedido é só de quem lidera a igreja.
  // Não é liberável por cargo.
  { key: "prayers", title: "Pedidos de oração", href: "/dashboard/prayers", roles: ["owner", "admin"] },
  // O dia a dia (cultos semanais e especiais).
  { key: "programacao", title: "Programação", href: "/dashboard/programacao", roles: ["owner", "admin"] },
  // Só o que tem inscrição e/ou pagamento.
  { key: "events", title: "Eventos", href: "/dashboard/events", roles: ["owner", "admin"] },
  { key: "campaigns", title: "Campanhas", href: "/dashboard/campaigns", roles: ["owner", "admin"] },
  { key: "sponsors", title: "Patrocinadores", href: "/dashboard/sponsors", roles: ["owner", "admin"] },
  // Pedidos de visita (nome e telefone de quem pediu).
  { key: "relationships", title: "Quem quer visita", href: "/dashboard/relationships", roles: ["owner", "admin"] },
  { key: "billing", title: "Assinatura", href: "/dashboard/billing", roles: ["owner"] },
  { key: "audit", title: "Auditoria", href: "/dashboard/audit", roles: ["owner", "admin"] },
  { key: "settings", title: "Configurações", href: "/dashboard/settings", roles: ["owner", "admin", "member"] },
];

/** O que cada módulo liberado deixa fazer (texto da tela de Acessos). */
export const MODULO_INFO: Record<Modulo, { titulo: string; libera: string; aviso?: string }> = {
  dashboard: {
    titulo: "Painel",
    libera:
      "Ver o painel inicial. Cada número e gráfico dele só aparece para quem também tem o módulo de onde vem. Sem o painel, a pessoa entra direto no primeiro menu que tem.",
  },
  acompanhamento: {
    titulo: "Presença nos cultos",
    libera: "Fazer a chamada, lançar justificativas e acompanhar quem está faltando.",
    aviso: "Mostra nomes e telefones dos membros.",
  },
  membros: {
    titulo: "Membros",
    libera: "Ver, cadastrar e editar os membros da igreja.",
    aviso: "Mostra dados pessoais de toda a igreja. Logins e convites continuam só com quem administra.",
  },
  ebd: {
    titulo: "EBD",
    libera: "Gerir a Escola Dominical inteira: classes, matrículas, chamada, trimestres e relatórios.",
    aviso: "Mostra dados de alunos, inclusive crianças.",
  },
  programacao: { titulo: "Programação", libera: "Criar e editar os cultos e horários da página da igreja." },
  events: { titulo: "Eventos", libera: "Publicar e editar eventos e ver as inscrições." },
  campaigns: {
    titulo: "Campanhas",
    libera: "Criar, publicar e encerrar campanhas e confirmar doações.",
    aviso: "A campanha aparece na página pública e recebe pelo Pix já cadastrado da igreja, que este cargo não altera.",
  },
  relationships: {
    titulo: "Quem quer visita",
    libera: "Ver os pedidos de visita, entrar em contato e marcar a visita como feita.",
    aviso: "Mostra nome, telefone e o motivo de quem pediu a visita.",
  },
};

/** A pessoa na igreja ativa. */
export interface PessoaAcesso {
  role: RoleCode;
  /** Módulos liberados pelos cargos da pessoa (a soma de todos os cargos dela). */
  acessos: string[];
  /** Ensina em alguma classe: abre a EBD só nas classes dela. */
  professor_ebd: boolean;
}

/**
 * Módulos da pessoa, a partir do que o banco devolve (meus_acessos): a soma
 * do que cada cargo dela libera. Só o cargo libera — não há mais autorização
 * avulsa na ficha. Módulo desconhecido é descartado.
 */
export function acessosDaPessoa(porCargo: string[]): Modulo[] {
  const todos = new Set<string>(porCargo);
  return MODULOS_LIBERAVEIS.filter((m) => todos.has(m));
}

/** A pessoa gerencia o módulo? (administra a igreja ou tem o módulo liberado) */
export function podeNoModulo(pessoa: Pick<PessoaAcesso, "role" | "acessos">, modulo: Modulo): boolean {
  return pessoa.role === "owner" || pessoa.role === "admin" || pessoa.acessos.includes(modulo);
}

/** Chaves dos menus que a pessoa vê. */
export function menusVisiveis(pessoa: PessoaAcesso): string[] {
  return MENUS.filter(
    (m) =>
      m.roles.includes(pessoa.role) || pessoa.acessos.includes(m.key) || (m.key === "ebd" && pessoa.professor_ebd),
  ).map((m) => m.key);
}

/**
 * Para onde a pessoa vai ao entrar: o painel, se tiver; senão o primeiro
 * menu que ela tem (ex.: o professor cai na EBD). Configurações é de todos,
 * então sempre há para onde ir.
 */
export function paginaInicial(pessoa: PessoaAcesso): string {
  const menus = menusVisiveis(pessoa);
  if (menus.includes("dashboard")) return "/dashboard";
  return MENUS.find((m) => menus.includes(m.key))?.href ?? "/dashboard/settings";
}

/** Linha gravada: da própria igreja (nivel 0) ou de uma acima (1 = mãe...). */
export interface LinhaAcesso {
  cargo_id: string;
  modulo: string;
  permitido: boolean;
  nivel: number;
  /** Nome da igreja que definiu. */
  igreja: string;
}

export interface CelulaAcesso {
  /** O que vale agora. */
  permitido: boolean;
  /** O que valeria sem a escolha desta igreja. */
  herdado: boolean;
  /** Igreja acima que definiu o herdado; null = padrão do cargo. */
  herdadoDe: string | null;
  /** Esta igreja tem escolha própria neste ponto. */
  propria: boolean;
}

const chave = (cargoId: string, modulo: string) => `${cargoId}:${modulo}`;

/** Cargo da igreja com o padrão dele (módulos que já vêm liberados). */
export interface CargoComPadrao {
  id: string;
  acessosPadrao: string[];
}

/**
 * Resolve cargo × módulo: a própria igreja vence; depois a acima mais
 * próxima; senão, o padrão do cargo (cargo criado pela igreja não tem).
 */
export function resolverAcessos(cargos: CargoComPadrao[], linhas: LinhaAcesso[]): Map<string, CelulaAcesso> {
  const proprias = new Map<string, LinhaAcesso>();
  const acima = new Map<string, LinhaAcesso>();
  for (const l of [...linhas].sort((a, b) => a.nivel - b.nivel)) {
    const k = chave(l.cargo_id, l.modulo);
    if (l.nivel === 0) proprias.set(k, l);
    else if (!acima.has(k)) acima.set(k, l);
  }

  const matriz = new Map<string, CelulaAcesso>();
  for (const cargo of cargos) {
    for (const modulo of MODULOS_LIBERAVEIS) {
      const k = chave(cargo.id, modulo);
      const pai = acima.get(k);
      const minha = proprias.get(k);
      const herdado = pai?.permitido ?? cargo.acessosPadrao.includes(modulo);
      matriz.set(k, {
        herdado,
        herdadoDe: pai?.igreja ?? null,
        propria: minha !== undefined,
        permitido: minha ? minha.permitido : herdado,
      });
    }
  }
  return matriz;
}

export function celula(matriz: Map<string, CelulaAcesso>, cargoId: string, modulo: Modulo): CelulaAcesso | undefined {
  return matriz.get(chave(cargoId, modulo));
}

/**
 * O que gravar quando a igreja salva os acessos.
 *
 * A igreja que mexe passa a ter configuração PRÓPRIA e inteira: grava todos
 * os pontos (cargo × módulo), não só os diferentes. Assim, o que a igreja
 * acima mudar depois não chega mais aqui. Voltar a seguir a de cima é apagar
 * tudo ("Voltar ao herdado").
 *
 * Exceção: igreja que ainda segue a de cima e salva sem mudar nada continua
 * seguindo (não grava nada). Cargo ou módulo desconhecido é descartado.
 */
export function escolhasParaGravar(
  desejado: Array<{ cargoId: string; modulo: string; permitido: boolean }>,
  cargos: CargoComPadrao[],
  linhas: LinhaAcesso[],
): Array<{ cargoId: string; modulo: Modulo; permitido: boolean }> {
  const deCima = resolverAcessos(
    cargos,
    linhas.filter((l) => l.nivel > 0),
  );
  const validas = desejado.flatMap((d) =>
    isModulo(d.modulo) && deCima.has(chave(d.cargoId, d.modulo))
      ? [{ cargoId: d.cargoId, modulo: d.modulo, permitido: d.permitido }]
      : [],
  );
  const jaTemPropria = linhas.some((l) => l.nivel === 0);
  const mudouAlgo = validas.some((d) => d.permitido !== deCima.get(chave(d.cargoId, d.modulo))?.herdado);
  return jaTemPropria || mudouAlgo ? validas : [];
}
