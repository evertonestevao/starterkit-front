import { describe, expect, it } from "vitest";
import {
  MODULOS_DESLIGAVEIS,
  acessosDaPessoa,
  celula,
  escolhasModulosParaGravar,
  escolhasParaGravar,
  menusVisiveis,
  paginaInicial,
  podeNoModulo,
  resolverAcessos,
  resolverModulos,
  type LinhaAcesso,
  type LinhaModulo,
  type PessoaAcesso,
} from "./menuPermissoes";

const SECRETARIO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DIACONO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// Sem padrão, como um cargo criado pela igreja.
const CARGOS = [{ id: SECRETARIO, acessosPadrao: [] as string[] }];

const pessoa = (over: Partial<PessoaAcesso>): PessoaAcesso => ({
  role: "member",
  acessos: [],
  professor_ebd: false,
  // Todos os módulos desligáveis ligados por padrão: só os testes do gate
  // abaixo pedem um conjunto menor explicitamente.
  modulosAtivos: [...MODULOS_DESLIGAVEIS],
  ...over,
});

const linha = (cargo_id: string, modulo: string, permitido: boolean, nivel: number, igreja = "Sede"): LinhaAcesso => ({
  cargo_id,
  modulo,
  permitido,
  nivel,
  igreja,
});

describe("menusVisiveis", () => {
  it("membro sem cargo liberado não vê menu da igreja e cai em Minha conta", () => {
    expect(menusVisiveis(pessoa({}))).toEqual([]);
    expect(paginaInicial(pessoa({}))).toBe("/dashboard/conta");
  });

  it("o painel é liberado por cargo, como qualquer módulo", () => {
    const comPainel = pessoa({ acessos: ["dashboard", "events"] });
    expect(menusVisiveis(comPainel)).toEqual(["dashboard", "events"]);
    expect(paginaInicial(comPainel)).toBe("/dashboard");
    // Sem o painel, entra no primeiro menu que tem.
    expect(paginaInicial(pessoa({ acessos: ["events"] }))).toBe("/dashboard/events");
  });

  it("quem só dá aula vê apenas a EBD; Configurações é de quem administra", () => {
    expect(menusVisiveis(pessoa({ professor_ebd: true }))).toEqual(["ebd"]);
    expect(menusVisiveis(pessoa({ role: "admin" }))).toContain("settings");
  });

  it("módulo liberado por cargo abre o menu dele, e só ele", () => {
    const menus = menusVisiveis(pessoa({ acessos: ["campaigns"] }));
    expect(menus).toContain("campaigns");
    expect(menus).not.toContain("membros");
    expect(menus).not.toContain("prayers");
    expect(menus).not.toContain("billing");
  });

  it("quem só dá aula não tem o painel geral e entra direto na EBD", () => {
    const professor = pessoa({ professor_ebd: true });
    expect(menusVisiveis(professor)).not.toContain("dashboard");
    expect(paginaInicial(professor)).toBe("/dashboard/ebd");
    // Professor que administra a igreja mantém o painel.
    expect(menusVisiveis(pessoa({ professor_ebd: true, role: "admin" }))).toContain("dashboard");
  });

  it("professor abre a EBD; a Mensalidade é de quem administra; a antiga Assinatura saiu do menu", () => {
    expect(menusVisiveis(pessoa({ professor_ebd: true }))).toContain("ebd");
    expect(menusVisiveis(pessoa({ professor_ebd: true }))).not.toContain("mensalidade");
    expect(menusVisiveis(pessoa({ role: "admin" }))).toContain("mensalidade");
    expect(menusVisiveis(pessoa({ role: "owner" }))).toContain("mensalidade");
    expect(menusVisiveis(pessoa({ role: "owner" }))).not.toContain("billing");
  });
});

describe("acessosDaPessoa e podeNoModulo", () => {
  it("os módulos vêm só dos cargos, na ordem do catálogo e sem repetir", () => {
    // Dois cargos liberando coisas diferentes (e uma em comum): vale a soma.
    expect(acessosDaPessoa(["events", "membros", "events", "dashboard"])).toEqual(["dashboard", "membros", "events"]);
    expect(acessosDaPessoa([])).toEqual([]);
  });

  it("módulo desconhecido vindo do banco é ignorado", () => {
    expect(acessosDaPessoa(["billing", "prayers"])).toEqual([]);
  });

  it("quem administra pode em qualquer módulo; membro só no liberado", () => {
    const ativos = [...MODULOS_DESLIGAVEIS];
    expect(podeNoModulo({ role: "admin", acessos: [], modulosAtivos: ativos }, "campaigns")).toBe(true);
    expect(podeNoModulo({ role: "member", acessos: ["events"], modulosAtivos: ativos }, "events")).toBe(true);
    expect(podeNoModulo({ role: "member", acessos: ["events"], modulosAtivos: ativos }, "campaigns")).toBe(false);
  });

  it("módulo não liberável (ex.: membros) não depende de modulosAtivos", () => {
    expect(podeNoModulo({ role: "member", acessos: ["membros"], modulosAtivos: [] }, "membros")).toBe(true);
  });
});

describe("módulo desligado pela igreja bloqueia até quem administra", () => {
  it("desligado, some do menu de owner/admin, não só de quem usa por cargo", () => {
    expect(menusVisiveis(pessoa({ role: "owner", modulosAtivos: [] }))).not.toContain("ebd");
    expect(menusVisiveis(pessoa({ role: "admin", modulosAtivos: [] }))).not.toContain("acompanhamento");
    // Módulo não desligável (membros, dashboard) continua valendo mesmo com modulosAtivos vazio.
    expect(menusVisiveis(pessoa({ role: "admin", modulosAtivos: [] }))).toContain("dashboard");
  });

  it("professor da EBD também fica sem o módulo se a igreja desligou", () => {
    expect(menusVisiveis(pessoa({ professor_ebd: true, modulosAtivos: [] }))).not.toContain("ebd");
  });

  it("podeNoModulo nega mesmo para quem administra", () => {
    expect(podeNoModulo({ role: "owner", acessos: [], modulosAtivos: [] }, "ebd")).toBe(false);
  });
});

describe("herança na rede", () => {
  it("sem definição, não está liberado", () => {
    expect(celula(resolverAcessos(CARGOS, []), SECRETARIO, "ebd")).toEqual({
      permitido: false,
      herdado: false,
      herdadoDe: null,
      propria: false,
    });
  });

  it("a igreja acima mais próxima vence; a própria vence todas", () => {
    const linhas = [linha(SECRETARIO, "ebd", false, 2, "Sede"), linha(SECRETARIO, "ebd", true, 1, "Subsede")];
    expect(celula(resolverAcessos(CARGOS, linhas), SECRETARIO, "ebd")).toMatchObject({
      permitido: true,
      herdadoDe: "Subsede",
      propria: false,
    });

    const comPropria = [...linhas, linha(SECRETARIO, "ebd", false, 0, "Cong")];
    expect(celula(resolverAcessos(CARGOS, comPropria), SECRETARIO, "ebd")).toMatchObject({
      permitido: false,
      herdado: true,
      propria: true,
    });
  });
});

describe("padrão do cargo", () => {
  const comPadrao = [{ id: SECRETARIO, acessosPadrao: ["membros", "events"] }];

  it("sem nenhuma igreja definindo, vale o padrão do cargo", () => {
    const matriz = resolverAcessos(comPadrao, []);
    expect(celula(matriz, SECRETARIO, "membros")).toEqual({ permitido: true, herdado: true, herdadoDe: null, propria: false });
    expect(celula(matriz, SECRETARIO, "campaigns")?.permitido).toBe(false);
  });

  it("a igreja acima e a própria vencem o padrão", () => {
    const tirouAcima = resolverAcessos(comPadrao, [linha(SECRETARIO, "membros", false, 1)]);
    expect(celula(tirouAcima, SECRETARIO, "membros")).toMatchObject({ permitido: false, herdadoDe: "Sede" });
    const tirouAqui = resolverAcessos(comPadrao, [linha(SECRETARIO, "events", false, 0, "Cong")]);
    expect(celula(tirouAqui, SECRETARIO, "events")).toMatchObject({ permitido: false, herdado: true, propria: true });
  });

  it("tirar o que o padrão libera conta como mudança e grava a configuração", () => {
    const gravar = escolhasParaGravar(
      [
        { cargoId: SECRETARIO, modulo: "membros", permitido: false },
        { cargoId: SECRETARIO, modulo: "events", permitido: true },
      ],
      comPadrao,
      [],
    );
    expect(gravar).toHaveLength(2);
    // Salvar exatamente o padrão, sem mexer, não grava nada.
    expect(
      escolhasParaGravar(
        [
          { cargoId: SECRETARIO, modulo: "membros", permitido: true },
          { cargoId: SECRETARIO, modulo: "events", permitido: true },
        ],
        comPadrao,
        [],
      ),
    ).toEqual([]);
  });
});

describe("escolhasParaGravar", () => {
  const deCima = [linha(SECRETARIO, "ebd", true, 1)];

  it("quem mexe grava a configuração inteira, para não seguir mais a igreja acima", () => {
    const gravar = escolhasParaGravar(
      [
        { cargoId: SECRETARIO, modulo: "ebd", permitido: true }, // igual ao herdado: grava mesmo assim
        { cargoId: SECRETARIO, modulo: "campaigns", permitido: true }, // a mudança
        { cargoId: SECRETARIO, modulo: "billing", permitido: true }, // não é liberável
        { cargoId: DIACONO, modulo: "ebd", permitido: true }, // cargo fora da lista
      ],
      CARGOS,
      deCima,
    );
    expect(gravar).toEqual([
      { cargoId: SECRETARIO, modulo: "ebd", permitido: true },
      { cargoId: SECRETARIO, modulo: "campaigns", permitido: true },
    ]);
    // Com isso gravado, a sede tirar a EBD depois não muda nada aqui.
    const depois = [linha(SECRETARIO, "ebd", false, 1), linha(SECRETARIO, "ebd", true, 0, "Cong")];
    expect(celula(resolverAcessos(CARGOS, depois), SECRETARIO, "ebd")?.permitido).toBe(true);
  });

  it("salvar sem mudar nada, ainda seguindo a de cima, continua seguindo", () => {
    expect(escolhasParaGravar([{ cargoId: SECRETARIO, modulo: "ebd", permitido: true }], CARGOS, deCima)).toEqual(
      [],
    );
  });

  it("quem já tem configuração própria continua com ela, mesmo ficando igual à de cima", () => {
    const linhas = [...deCima, linha(SECRETARIO, "ebd", false, 0, "Cong")];
    expect(escolhasParaGravar([{ cargoId: SECRETARIO, modulo: "ebd", permitido: true }], CARGOS, linhas)).toEqual([
      { cargoId: SECRETARIO, modulo: "ebd", permitido: true },
    ]);
  });
});

const linhaModulo = (modulo: string, ativo: boolean, nivel: number, igreja = "Sede"): LinhaModulo => ({
  modulo,
  ativo,
  nivel,
  igreja,
});

describe("resolverModulos: herança igual à de cargo, mas sem a dimensão de cargo", () => {
  it("sem nenhuma definição, o módulo está ativo (oposto do padrão de cargo)", () => {
    expect(resolverModulos([]).get("ebd")).toEqual({ ativo: true, herdado: true, herdadoDe: null, propria: false });
  });

  it("a igreja acima mais próxima vence; a própria vence todas", () => {
    const linhas = [linhaModulo("ebd", false, 2, "Sede"), linhaModulo("ebd", true, 1, "Subsede")];
    expect(resolverModulos(linhas).get("ebd")).toMatchObject({ ativo: true, herdadoDe: "Subsede", propria: false });

    const comPropria = [...linhas, linhaModulo("ebd", false, 0, "Cong")];
    expect(resolverModulos(comPropria).get("ebd")).toMatchObject({ ativo: false, herdado: true, propria: true });
  });
});

describe("escolhasModulosParaGravar", () => {
  const deCimaModulos = [linhaModulo("ebd", true, 1)];

  it("quem mexe grava a configuração inteira", () => {
    const gravar = escolhasModulosParaGravar(
      [
        { modulo: "ebd", ativo: false }, // a mudança
        { modulo: "programacao", ativo: true },
        { modulo: "membros", ativo: false }, // não é desligável: descartado
      ],
      deCimaModulos,
    );
    expect(gravar).toEqual([
      { modulo: "ebd", ativo: false },
      { modulo: "programacao", ativo: true },
    ]);
  });

  it("salvar sem mudar nada, ainda seguindo a de cima, continua seguindo", () => {
    expect(escolhasModulosParaGravar([{ modulo: "ebd", ativo: true }], deCimaModulos)).toEqual([]);
  });

  it("quem já tem configuração própria continua com ela, mesmo ficando igual à de cima", () => {
    const linhas = [...deCimaModulos, linhaModulo("ebd", false, 0, "Cong")];
    expect(escolhasModulosParaGravar([{ modulo: "ebd", ativo: true }], linhas)).toEqual([
      { modulo: "ebd", ativo: true },
    ]);
  });
});
