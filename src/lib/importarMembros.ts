/**
 * Importação de membros por planilha (CSV ou colado do Excel/Google
 * Planilhas). Lógica pura, sem I/O: lê o texto, acha as colunas pelo
 * cabeçalho e devolve cada linha já normalizada, com os problemas que achou.
 *
 * Sem biblioteca: o formato aceito é texto separado por ponto e vírgula,
 * vírgula ou tabulação — o que o Excel em português grava em "CSV" e o que
 * sai ao copiar células de qualquer planilha.
 */

export const LIMITE_IMPORTACAO = 1000;

export type CampoImportavel = "nome" | "whatsapp" | "email" | "nascimento" | "batismo" | "observacoes";

export const CAMPO_IMPORTAVEL_LABEL: Record<CampoImportavel, string> = {
  nome: "Nome",
  whatsapp: "Telefone",
  email: "E-mail",
  nascimento: "Nascimento",
  batismo: "Batismo",
  observacoes: "Observações",
};

/** Como cada coluna costuma vir escrita no cabeçalho (sem acento, minúsculo). */
const APELIDOS: Record<CampoImportavel, string[]> = {
  nome: ["nome", "nome completo", "membro", "nome do membro"],
  whatsapp: ["telefone", "whatsapp", "celular", "fone", "contato", "tel", "zap"],
  email: ["email", "e-mail", "e mail", "correio eletronico"],
  nascimento: ["nascimento", "data de nascimento", "data nascimento", "dt nascimento", "aniversario", "nasc"],
  batismo: ["batismo", "data de batismo", "data batismo", "dt batismo", "batizado em"],
  observacoes: ["observacoes", "observacao", "obs", "anotacoes", "notas"],
};

export interface LinhaImportada {
  /** Número da linha na planilha (1 = cabeçalho), para a pessoa achar o erro. */
  linha: number;
  nome: string;
  whatsapp: string;
  email: string;
  /** YYYY-MM-DD, ou "" se não veio. */
  nascimento: string;
  batismo: string;
  observacoes: string;
  /** Problemas que impedem importar esta linha. */
  erros: string[];
  /**
   * Linha anterior da planilha com o mesmo nome E a mesma data de nascimento
   * (possível repetido: a pessoa decide na conferência). null = não repete.
   */
  repeteLinha: number | null;
}

export interface PlanilhaLida {
  /** Colunas reconhecidas, na ordem do arquivo. */
  colunas: CampoImportavel[];
  /** Cabeçalhos que não viraram campo nenhum (avisados, não é erro). */
  ignoradas: string[];
  linhas: LinhaImportada[];
  /** Problema que impede ler a planilha inteira (ex.: sem coluna de nome). */
  erro: string | null;
}

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Separador mais provável, pela primeira linha: tab > ponto e vírgula > vírgula. */
export function detectarSeparador(primeiraLinha: string): string {
  const conta = (s: string) => primeiraLinha.split(s).length - 1;
  if (conta("\t") > 0) return "\t";
  return conta(";") >= conta(",") && conta(";") > 0 ? ";" : ",";
}

/** Texto delimitado → matriz de células. Respeita aspas ("a; b", "" como aspa). */
export function lerDelimitado(texto: string, separador: string): string[][] {
  const linhas: string[][] = [];
  let atual: string[] = [];
  let celula = "";
  let emAspas = false;
  const t = texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (emAspas) {
      if (c === '"' && t[i + 1] === '"') {
        celula += '"';
        i++;
      } else if (c === '"') emAspas = false;
      else celula += c;
    } else if (c === '"' && celula === "") emAspas = true;
    else if (c === separador) {
      atual.push(celula);
      celula = "";
    } else if (c === "\n") {
      atual.push(celula);
      linhas.push(atual);
      atual = [];
      celula = "";
    } else celula += c;
  }
  if (celula !== "" || atual.length > 0) {
    atual.push(celula);
    linhas.push(atual);
  }
  // Linhas totalmente vazias (comuns no fim da planilha) saem.
  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

/** "25/12/1980", "25-12-80" ou "1980-12-25" → "1980-12-25". Vazio → "". Inválida → null. */
export function lerData(valor: string, hojeAno = new Date().getFullYear()): string | null {
  const v = valor.trim();
  if (v === "") return "";
  let ano: number, mes: number, dia: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v);
  if (iso) [ano, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (br) {
    [dia, mes, ano] = [Number(br[1]), Number(br[2]), Number(br[3])];
    // Ano com dois dígitos: até o ano atual é 20xx; depois disso, 19xx.
    if (br[3].length === 2) ano += ano <= hojeAno % 100 ? 2000 : 1900;
  } else return null;

  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  if (ano < 1900 || ano > hojeAno) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Chave para achar o mesmo nome escrito com outra caixa/acento. */
export function chaveDoNome(nome: string): string {
  return semAcento(nome);
}

/**
 * Chave de "pode ser a mesma pessoa": mesmo nome E mesma data de nascimento.
 * Só o nome não basta — homônimos existem (pai e filho, nomes comuns). Sem
 * data nos dois lados também casa: é o que evita duplicar a igreja inteira
 * ao importar duas vezes uma planilha que não tem a coluna de nascimento.
 */
export function chaveDePessoa(nome: string, nascimento: string | null | undefined): string {
  return `${chaveDoNome(nome)}|${nascimento ?? ""}`;
}

/**
 * Entre as linhas boas, quais batem (nome + nascimento) com alguém já
 * cadastrado. Devolve os números das linhas.
 */
export function linhasJaCadastradas(
  linhas: LinhaImportada[],
  existentes: Array<{ nome: string; nascimento: string | null }>,
): Set<number> {
  const cadastrados = new Set(existentes.map((m) => chaveDePessoa(m.nome, m.nascimento)));
  return new Set(
    linhas.filter((l) => l.erros.length === 0 && cadastrados.has(chaveDePessoa(l.nome, l.nascimento))).map((l) => l.linha),
  );
}

const soDigitos = (t: string) => t.replace(/\D/g, "");

/** Lê a planilha inteira: acha as colunas pelo cabeçalho e valida cada linha. */
export function lerPlanilhaDeMembros(texto: string): PlanilhaLida {
  const vazia: PlanilhaLida = { colunas: [], ignoradas: [], linhas: [], erro: null };
  const primeira = texto.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  if (texto.trim() === "") return { ...vazia, erro: "A planilha está vazia." };

  const matriz = lerDelimitado(texto, detectarSeparador(primeira));
  if (matriz.length < 2) {
    return { ...vazia, erro: "A planilha precisa ter a linha de títulos e pelo menos um membro." };
  }

  const cabecalho = matriz[0];
  const mapa: Array<CampoImportavel | null> = cabecalho.map((titulo) => {
    const chave = semAcento(titulo);
    return (Object.keys(APELIDOS) as CampoImportavel[]).find((campo) => APELIDOS[campo].includes(chave)) ?? null;
  });
  // Coluna repetida (dois "Telefone"): vale a primeira.
  const vistos = new Set<CampoImportavel>();
  mapa.forEach((campo, i) => {
    if (!campo) return;
    if (vistos.has(campo)) mapa[i] = null;
    else vistos.add(campo);
  });

  if (!vistos.has("nome")) {
    return { ...vazia, erro: 'Não achei a coluna "Nome". A primeira linha precisa ter os títulos das colunas.' };
  }
  if (matriz.length - 1 > LIMITE_IMPORTACAO) {
    return { ...vazia, erro: `A planilha tem ${matriz.length - 1} linhas. Importe até ${LIMITE_IMPORTACAO} por vez.` };
  }

  const pessoasVistas = new Map<string, number>();
  const linhas = matriz.slice(1).map((celulas, i): LinhaImportada => {
    const valor = (campo: CampoImportavel) => {
      const idx = mapa.indexOf(campo);
      return idx >= 0 ? (celulas[idx] ?? "").trim() : "";
    };
    const erros: string[] = [];
    const linha = i + 2;

    const nome = valor("nome").replace(/\s+/g, " ");
    if (nome.length < 2) erros.push("sem nome");
    else if (nome.length > 120) erros.push("nome longo demais");

    const whatsapp = valor("whatsapp");
    if (whatsapp && soDigitos(whatsapp).length < 10) erros.push("telefone sem DDD");
    else if (whatsapp.length > 20) erros.push("telefone inválido");

    const email = valor("email").toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) erros.push("e-mail inválido");

    const nascimento = lerData(valor("nascimento"));
    if (nascimento === null) erros.push("data de nascimento inválida");
    const batismo = lerData(valor("batismo"));
    if (batismo === null) erros.push("data de batismo inválida");

    const observacoes = valor("observacoes");
    if (observacoes.length > 1000) erros.push("observação longa demais");

    // Mesmo nome e mesmo nascimento de uma linha anterior: não é erro, é uma
    // pergunta para a conferência ("é a mesma pessoa?").
    let repeteLinha: number | null = null;
    if (erros.length === 0) {
      const chave = chaveDePessoa(nome, nascimento);
      repeteLinha = pessoasVistas.get(chave) ?? null;
      if (repeteLinha === null) pessoasVistas.set(chave, linha);
    }

    return {
      linha,
      nome,
      whatsapp,
      email,
      nascimento: nascimento ?? "",
      batismo: batismo ?? "",
      observacoes,
      erros,
      repeteLinha,
    };
  });

  return {
    colunas: mapa.filter((c): c is CampoImportavel => c !== null),
    ignoradas: cabecalho.filter((_, i) => mapa[i] === null).map((t) => t.trim()).filter(Boolean),
    linhas,
    erro: null,
  };
}

/** Modelo para baixar: os títulos certos e uma linha de exemplo. */
export const MODELO_CSV =
  "Nome;Telefone;E-mail;Nascimento;Batismo;Observações\r\n" +
  "Maria da Silva;(11) 98888-7777;maria@email.com;25/12/1980;10/06/2005;Coral\r\n";
