import { formatarData } from "@/lib/acompanhamento";
import {
  ESTADO_CIVIL_LABEL,
  FORMA_ENTRADA_LABEL,
  SEXO_LABEL,
  SITUACAO_LABEL,
  SITUACOES,
  mascaraCep,
} from "@/lib/fichaMembro";
import { saudar } from "@/lib/saudacao";
import { mascaraTelefone } from "@/lib/telefone";
import type { Aniversario, FichaMembro, RolMembro, SituacaoMembro, TipoAniversario } from "@/types/acompanhamento";

/** Lista de membros: filtros, exportação e aniversariantes. Sem I/O. */

// ------------------------------------------------------------------ filtros
/** Filtro de situação da lista: uma situação, ou "todas". */
export type FiltroSituacao = SituacaoMembro | "todas";

export const FILTRO_SITUACAO_LABEL: Record<FiltroSituacao, string> = {
  ativo: "Ativos",
  afastado: "Afastados",
  transferido: "Transferidos",
  desligado: "Desligados",
  falecido: "Falecidos",
  todas: "Todas as situações",
};

/** O que vem da URL vira um filtro válido; sem nada (ou lixo), só os ativos. */
export function lerFiltroSituacao(valor: string | null | undefined): FiltroSituacao {
  if (valor === "todas") return "todas";
  return (SITUACOES as string[]).includes(valor ?? "") ? (valor as SituacaoMembro) : "ativo";
}

export type FiltroQuadro = "membros" | "nao_membros" | "todos";

export function lerFiltroQuadro(valor: string | null | undefined): FiltroQuadro {
  return valor === "membros" || valor === "nao_membros" ? valor : "todos";
}

// ------------------------------------------------------------- exportação
/**
 * Uma célula de CSV. Além das aspas, neutraliza fórmula: planilha executa o
 * que começa com = + - @ (e tab/CR), e nome de membro é texto digitado por
 * terceiros (importação, formulário). O apóstrofo faz a planilha tratar como texto.
 */
export function celulaCsv(valor: string | null | undefined): string {
  let texto = (valor ?? "").replace(/\r?\n/g, " ").trim();
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[";]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const data = (d: string | null | undefined) => (d ? formatarData(d) : "");

/**
 * O rol em CSV (ponto e vírgula e BOM: abre direto no Excel em português).
 * As colunas da ficha só entram com `comFicha` — quem não tem o módulo
 * Membros recebe só os dados da lista.
 */
export function membrosParaCsv(
  membros: RolMembro[],
  fichas: Record<string, FichaMembro>,
  comFicha: boolean,
): string {
  const cabecalho = ["Nome", "Situação", "Quadro", "Cargos", "WhatsApp", "E-mail", "Nascimento", "Batismo"];
  if (comFicha) {
    cabecalho.push(
      "Sexo", "Estado civil", "Cônjuge", "Casamento", "Pai", "Mãe", "Filhos", "Naturalidade", "Profissão",
      "CEP", "Endereço", "Número", "Complemento", "Bairro", "Cidade", "UF",
      "Conversão", "Membro desde", "Entrada", "Igreja de origem", "Situação desde", "Motivo da situação",
    );
  }
  const linhas = membros.map((m) => {
    const linha = [
      m.nome,
      SITUACAO_LABEL[m.situacao],
      m.membroIgreja ? "Membro" : "Não membro",
      m.cargos.map((c) => c.nome).join(", "),
      mascaraTelefone(m.whatsapp),
      m.email ?? "",
      data(m.nascimento),
      data(m.batismo),
    ];
    if (comFicha) {
      const f = fichas[m.id];
      linha.push(
        f?.sexo ? SEXO_LABEL[f.sexo] : "",
        f?.estadoCivil ? ESTADO_CIVIL_LABEL[f.estadoCivil] : "",
        f?.conjugeNome ?? "",
        data(f?.dataCasamento),
        f?.paiNome ?? "",
        f?.maeNome ?? "",
        f?.filhos ?? "",
        f?.naturalidade ?? "",
        f?.profissao ?? "",
        f?.cep ? mascaraCep(f.cep) : "",
        f?.logradouro ?? "",
        f?.numero ?? "",
        f?.complemento ?? "",
        f?.bairro ?? "",
        f?.cidade ?? "",
        f?.uf ?? "",
        data(f?.dataConversao),
        data(f?.membroDesde),
        f?.entradaForma ? FORMA_ENTRADA_LABEL[f.entradaForma] : "",
        f?.igrejaOrigem ?? "",
        data(f?.situacaoEm),
        f?.situacaoMotivo ?? "",
      );
    }
    return linha;
  });
  const corpo = [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(";")).join("\r\n");
  return `﻿${corpo}\r\n`;
}

// ---------------------------------------------------------- aniversariantes
export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const TIPO_ANIVERSARIO_LABEL: Record<TipoAniversario, string> = {
  nascimento: "Aniversário",
  batismo: "Batismo",
  casamento: "Casamento",
};

/** Mês da URL (1 a 12); fora disso, o mês de hoje (`hoje` = AAAA-MM-DD). */
export function lerMes(valor: string | null | undefined, hoje: string): number {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : Number(hoje.slice(5, 7));
}

/** Por dia do mês; no mesmo dia, por nome. */
export function ordenarAniversarios(itens: Aniversario[]): Aniversario[] {
  return [...itens].sort((a, b) => a.dia - b.dia || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Um aniversário que ainda vai acontecer, com a data deste ciclo (AAAA-MM-DD). */
export interface ProximoAniversario extends Aniversario {
  quando: string;
  /** 0 = hoje, 1 = amanhã... */
  emDias: number;
}

/**
 * Os próximos a partir de hoje, juntando o resto deste mês com o mês seguinte
 * (no fim do mês a lista não fica vazia). `hoje` = AAAA-MM-DD.
 */
export function proximosAniversarios(
  esteMes: Aniversario[],
  proximoMes: Aniversario[],
  hoje: string,
  limite: number,
): ProximoAniversario[] {
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const base = Date.UTC(ano, mes - 1, dia);
  const noCiclo = (a: Aniversario, anoDoMes: number, mesDoItem: number): ProximoAniversario => {
    const quando = `${anoDoMes}-${String(mesDoItem).padStart(2, "0")}-${String(a.dia).padStart(2, "0")}`;
    return { ...a, quando, emDias: Math.round((Date.UTC(anoDoMes, mesDoItem - 1, a.dia) - base) / 86_400_000) };
  };
  const seguinte = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
  return [
    ...ordenarAniversarios(esteMes.filter((a) => a.dia >= dia)).map((a) => noCiclo(a, ano, mes)),
    ...ordenarAniversarios(proximoMes).map((a) => noCiclo(a, seguinte.ano, seguinte.mes)),
  ].slice(0, limite);
}

/** "Hoje", "Amanhã" ou "12/10". */
export function descreverQuando(item: ProximoAniversario): string {
  if (item.emDias === 0) return "Hoje";
  if (item.emDias === 1) return "Amanhã";
  return `${item.quando.slice(8, 10)}/${item.quando.slice(5, 7)}`;
}

/** "32 anos", "5 anos de batismo", "10 anos de casados" — o que a pessoa completa em `ano`. */
export function descreverAnos(item: Aniversario, ano: number): string | null {
  const anos = ano - Number(item.data.slice(0, 4));
  if (!Number.isFinite(anos) || anos <= 0) return null;
  const n = `${anos} ${anos === 1 ? "ano" : "anos"}`;
  if (item.tipo === "nascimento") return n;
  return item.tipo === "batismo" ? `${n} de batismo` : `${n} de casados`;
}

/** Mensagem pronta de parabéns (a tela abre o WhatsApp com ela). */
export function mensagemParabens(item: Aniversario, igreja: string, saudacao?: string | null): string {
  const abertura = saudar(saudacao, item.nome);
  if (item.tipo === "batismo") {
    return `${abertura} Hoje faz mais um ano do seu batismo. A ${igreja} se alegra com você por essa caminhada!`;
  }
  if (item.tipo === "casamento") {
    return `${abertura} Parabéns pelo aniversário de casamento! A ${igreja} deseja muitas bênçãos para o seu lar.`;
  }
  return `${abertura} Feliz aniversário! A ${igreja} deseja a você um novo ano cheio de bênçãos.`;
}
