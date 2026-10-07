/**
 * Painel da rede: a saúde das igrejas de baixo, para a igreja de cima. Regras
 * puras (sem I/O) sobre os números que o banco devolve — só números, nunca
 * pessoas: somar, filtrar por unidade, montar as séries dos gráficos e dizer
 * qual unidade pede atenção.
 */

export type MensalidadeDaUnidade = "em_dia" | "pendente" | "suspensa" | "coberta";

export interface UnidadeDaRede {
  churchId: string;
  churchName: string;
  tipo: string;
  parentId: string | null;
  /** 1 = logo abaixo de quem olha; 2 = um nível mais abaixo. */
  nivel: number;
  paginaAtiva: boolean;
  membrosAtivos: number;
  membrosAfastados: number;
  membrosNovos90d: number;
  cultoUltimaChamada: string | null;
  /** 0–100, ou null sem chamada no período. */
  cultoPresenca8s: number | null;
  cultoEmAlerta: number;
  cultoVisitantes30d: number;
  ebdClasses: number;
  ebdMatriculados: number;
  ebdUltimaAula: string | null;
  ebdPresenca8s: number | null;
  visitasSemContato: number;
  visitasFeitas90d: number;
  eventosProximos: number;
  dizimosMesCents: number;
  ofertasMesCents: number;
  /** Só vem para o Responsável da igreja de cima; para os demais, null. */
  mensalidade: MensalidadeDaUnidade | null;
}

export interface SemanaDaRede {
  churchId: string;
  /** AAAA-MM-DD do domingo que fecha a semana. */
  semana: string;
  cultoPresentes: number;
  cultoAusentes: number;
  cultoVisitantes: number;
  ebdPresentes: number;
  ebdAusentes: number;
}

export interface MesDaRede {
  churchId: string;
  /** AAAA-MM-01. */
  mes: string;
  dizimosCents: number;
  ofertasCents: number;
  membrosNovos: number;
}

export interface PainelDaRede {
  unidades: UnidadeDaRede[];
  semanas: SemanaDaRede[];
  meses: MesDaRede[];
}

/** Quantas semanas e meses os gráficos mostram (o banco devolve o mesmo intervalo). */
export const SEMANAS_NO_GRAFICO = 12;
export const MESES_NO_GRAFICO = 6;

/** Sem chamada nem aula há mais que isto, a unidade é dada como parada. */
export const DIAS_PARA_PARADA = 45;
/** Sem chamada (ou sem aula, tendo classes) há mais que isto, pede atenção. */
export const DIAS_SEM_REGISTRO = 21;
/** Presença abaixo disto pede atenção. */
export const PRESENCA_MINIMA = 60;
/** Fatia dos membros em alerta de faltas a partir da qual pede atenção. */
export const FATIA_EM_ALERTA = 0.2;

const DIA = 86_400_000;
const data = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Dias corridos de `de` até `ate` (AAAA-MM-DD). */
export function diasDesde(de: string, ate: string): number {
  return Math.round((data(ate) - data(de)) / DIA);
}

export type NivelDeSaude = "boa" | "atencao" | "parada";

export interface SaudeDaUnidade {
  nivel: NivelDeSaude;
  /** Por que não está "boa" — frases prontas para a tela. Vazio quando está. */
  motivos: string[];
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Como está a unidade, e por quê. "Parada" é não registrar culto nem EBD há
 * muito tempo (ou nunca ter começado); "atenção" é qualquer sinal que mereça
 * uma conversa. Os motivos saem na ordem em que a liderança costuma agir.
 */
export function saudeDaUnidade(u: UnidadeDaRede, hoje: string): SaudeDaUnidade {
  const semChamada = u.cultoUltimaChamada ? diasDesde(u.cultoUltimaChamada, hoje) : null;
  const semAula = u.ebdUltimaAula ? diasDesde(u.ebdUltimaAula, hoje) : null;
  const motivos: string[] = [];

  if (u.mensalidade === "suspensa") motivos.push("Painel suspenso por mensalidade pendente");
  else if (u.mensalidade === "pendente") motivos.push("Mensalidade pendente");

  const cultoParado = semChamada === null || semChamada > DIAS_PARA_PARADA;
  const ebdParada = semAula === null || semAula > DIAS_PARA_PARADA;
  if (cultoParado && ebdParada) {
    motivos.unshift(
      semChamada === null && semAula === null
        ? "Ainda não registrou culto nem EBD"
        : `Sem registro de culto nem de EBD há mais de ${DIAS_PARA_PARADA} dias`,
    );
    return { nivel: "parada", motivos };
  }

  if (semChamada === null) motivos.push("Ainda não registrou presença nos cultos");
  else if (semChamada > DIAS_SEM_REGISTRO) motivos.push(`Sem chamada de culto há ${semChamada} dias`);
  if (u.cultoPresenca8s !== null && u.cultoPresenca8s < PRESENCA_MINIMA) {
    motivos.push(`Presença nos cultos em ${formatarPorcento(u.cultoPresenca8s)}`);
  }
  if (u.membrosAtivos > 0 && u.cultoEmAlerta / u.membrosAtivos >= FATIA_EM_ALERTA) {
    motivos.push(`${plural(u.cultoEmAlerta, "membro", "membros")} em alerta de faltas`);
  }
  if (u.ebdClasses > 0 && (semAula === null || semAula > DIAS_SEM_REGISTRO)) {
    motivos.push(semAula === null ? "EBD com classes, mas sem aula registrada" : `EBD sem aula há ${semAula} dias`);
  }
  if (u.ebdPresenca8s !== null && u.ebdPresenca8s < PRESENCA_MINIMA) {
    motivos.push(`Presença na EBD em ${formatarPorcento(u.ebdPresenca8s)}`);
  }
  if (u.visitasSemContato > 0) {
    motivos.push(`${plural(u.visitasSemContato, "pedido de visita", "pedidos de visita")} sem contato`);
  }
  return { nivel: motivos.length > 0 ? "atencao" : "boa", motivos };
}

/** "76,3%"; "—" quando não há o que medir. */
export function formatarPorcento(valor: number | null): string {
  return valor === null ? "—" : `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Percentual de presentes sobre presentes + ausentes; null sem ninguém contado. */
export function percentual(presentes: number, ausentes: number): number | null {
  const total = presentes + ausentes;
  return total === 0 ? null : Math.round((1000 * presentes) / total) / 10;
}

const semAcento = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").trim();

/** Busca pelo nome, sem ligar para acento nem maiúscula. Busca vazia devolve tudo. */
export function buscarUnidades(unidades: UnidadeDaRede[], busca: string): UnidadeDaRede[] {
  const termo = semAcento(busca);
  if (!termo) return unidades;
  return unidades.filter((u) => semAcento(u.churchName).includes(termo));
}

/** As unidades do recorte: todas, ou só a escolhida. */
export function recorte(unidades: UnidadeDaRede[], churchId: string | null): UnidadeDaRede[] {
  return churchId ? unidades.filter((u) => u.churchId === churchId) : unidades;
}

export interface TotaisDaRede {
  unidades: number;
  membrosAtivos: number;
  membrosNovos90d: number;
  emAlerta: number;
  visitantes30d: number;
  matriculadosEbd: number;
  visitasSemContato: number;
  visitasFeitas90d: number;
  eventosProximos: number;
  dizimosMesCents: number;
  ofertasMesCents: number;
  /** Presença das últimas 8 semanas, somando as pessoas de todas as unidades do recorte. */
  presencaCultos: number | null;
  presencaEbd: number | null;
  /** Quantas unidades em cada situação. */
  saude: Record<NivelDeSaude, number>;
  /** Mensalidades pendentes ou suspensas; null quando quem olha não as recebe. */
  mensalidadesPendentes: number | null;
}

/**
 * Os números do topo, para as unidades do recorte. A presença é calculada
 * sobre as PESSOAS (das séries semanais), não pela média dos percentuais das
 * unidades — senão uma congregação de 10 pesaria o mesmo que uma de 300.
 */
export function totaisDaRede(unidades: UnidadeDaRede[], semanas: SemanaDaRede[], hoje: string): TotaisDaRede {
  const ids = new Set(unidades.map((u) => u.churchId));
  const desde = iso(data(hoje) - 56 * DIA);
  const recentes = semanas.filter((s) => ids.has(s.churchId) && s.semana >= desde);
  const soma = (campo: keyof UnidadeDaRede) => unidades.reduce((t, u) => t + (u[campo] as number), 0);
  const somaSemanas = (campo: keyof SemanaDaRede) => recentes.reduce((t, s) => t + (s[campo] as number), 0);

  const saude: Record<NivelDeSaude, number> = { boa: 0, atencao: 0, parada: 0 };
  for (const u of unidades) saude[saudeDaUnidade(u, hoje).nivel] += 1;

  return {
    unidades: unidades.length,
    membrosAtivos: soma("membrosAtivos"),
    membrosNovos90d: soma("membrosNovos90d"),
    emAlerta: soma("cultoEmAlerta"),
    visitantes30d: soma("cultoVisitantes30d"),
    matriculadosEbd: soma("ebdMatriculados"),
    visitasSemContato: soma("visitasSemContato"),
    visitasFeitas90d: soma("visitasFeitas90d"),
    eventosProximos: soma("eventosProximos"),
    dizimosMesCents: soma("dizimosMesCents"),
    ofertasMesCents: soma("ofertasMesCents"),
    presencaCultos: percentual(somaSemanas("cultoPresentes"), somaSemanas("cultoAusentes")),
    presencaEbd: percentual(somaSemanas("ebdPresentes"), somaSemanas("ebdAusentes")),
    saude,
    mensalidadesPendentes: unidades.some((u) => u.mensalidade !== null)
      ? unidades.filter((u) => u.mensalidade === "pendente" || u.mensalidade === "suspensa").length
      : null,
  };
}

/** O domingo que fecha a semana (segunda a domingo) de uma data. */
export function domingoDaSemana(dataISO: string): string {
  const ms = data(dataISO);
  const diaDaSemana = new Date(ms).getUTCDay(); // 0 = domingo
  return iso(ms + ((7 - diaDaSemana) % 7) * DIA);
}

// `type` (e não `interface`) para caber em `Record<string, unknown>`, que é o que os gráficos pedem.
export type PontoSemanal = {
  /** "05/10" — o domingo da semana. */
  semana: string;
  cultoPresenca: number | null;
  ebdPresenca: number | null;
  cultoPresentes: number;
  ebdPresentes: number;
  visitantes: number;
};

/**
 * Uma linha por semana, das últimas 12 até a de hoje, somando as unidades do
 * recorte. Semana sem registro entra com zero pessoas e presença nula (o
 * gráfico mostra o buraco, em vez de fingir 0%).
 */
export function serieSemanal(semanas: SemanaDaRede[], churchId: string | null, hoje: string): PontoSemanal[] {
  const ultima = data(domingoDaSemana(hoje));
  return Array.from({ length: SEMANAS_NO_GRAFICO }, (_, i) => {
    const semana = iso(ultima - (SEMANAS_NO_GRAFICO - 1 - i) * 7 * DIA);
    const linhas = semanas.filter((s) => s.semana === semana && (!churchId || s.churchId === churchId));
    const soma = (campo: keyof SemanaDaRede) => linhas.reduce((t, s) => t + (s[campo] as number), 0);
    return {
      semana: `${semana.slice(8, 10)}/${semana.slice(5, 7)}`,
      cultoPresenca: percentual(soma("cultoPresentes"), soma("cultoAusentes")),
      ebdPresenca: percentual(soma("ebdPresentes"), soma("ebdAusentes")),
      cultoPresentes: soma("cultoPresentes"),
      ebdPresentes: soma("ebdPresentes"),
      visitantes: soma("cultoVisitantes"),
    };
  });
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export type PontoMensal = {
  /** "out/26". */
  mes: string;
  /** Em reais (o gráfico formata como moeda). */
  dizimos: number;
  ofertas: number;
  membrosNovos: number;
};

/** Uma linha por mês, dos últimos 6 até o de hoje, somando as unidades do recorte. */
export function serieMensal(meses: MesDaRede[], churchId: string | null, hoje: string): PontoMensal[] {
  const ano = Number(hoje.slice(0, 4));
  const mesAtual = Number(hoje.slice(5, 7)) - 1;
  return Array.from({ length: MESES_NO_GRAFICO }, (_, i) => {
    const d = new Date(Date.UTC(ano, mesAtual - (MESES_NO_GRAFICO - 1 - i), 1));
    const chave = iso(d.getTime());
    const linhas = meses.filter((m) => m.mes === chave && (!churchId || m.churchId === churchId));
    const soma = (campo: keyof MesDaRede) => linhas.reduce((t, m) => t + (m[campo] as number), 0);
    return {
      mes: `${MESES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`,
      dizimos: soma("dizimosCents") / 100,
      ofertas: soma("ofertasCents") / 100,
      membrosNovos: soma("membrosNovos"),
    };
  });
}

/** O menu do painel da rede. */
export const MENU_REDE = "rede";

/** O item "Rede" só fica para a igreja que tem unidades abaixo. */
export function menusComRede(menus: string[], temUnidades: boolean): string[] {
  return temUnidades ? menus : menus.filter((m) => m !== MENU_REDE);
}

const ORDEM_DA_SAUDE: Record<NivelDeSaude, number> = { parada: 0, atencao: 1, boa: 2 };

/** Quem mais precisa de atenção primeiro; no empate, a ordem da árvore que veio do banco. */
export function porUrgencia(unidades: UnidadeDaRede[], hoje: string): UnidadeDaRede[] {
  return unidades
    .map((u, i) => ({ u, i, ordem: ORDEM_DA_SAUDE[saudeDaUnidade(u, hoje).nivel] }))
    .sort((a, b) => a.ordem - b.ordem || a.i - b.i)
    .map((x) => x.u);
}
