import { describe, expect, it } from "vitest";
import {
  acessosDaPessoa,
  celula,
  escolhasParaGravar,
  menusVisiveis,
  paginaInicial,
  podeNoModulo,
  resolverAcessos,
  type LinhaAcesso,
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
  it("membro sem cargo liberado vê só as próprias configurações e cai nelas", () => {
    expect(menusVisiveis(pessoa({}))).toEqual(["settings"]);
    expect(paginaInicial(pessoa({}))).toBe("/dashboard/settings");
  });

  it("o painel é liberado por cargo, como qualquer módulo", () => {
    const comPainel = pessoa({ acessos: ["dashboard", "events"] });
    expect(menusVisiveis(comPainel)).toEqual(["dashboard", "events", "settings"]);
    expect(paginaInicial(comPainel)).toBe("/dashboard");
    // Sem o painel, entra no primeiro menu que tem.
    expect(paginaInicial(pessoa({ acessos: ["events"] }))).toBe("/dashboard/events");
  });

  it("quem só dá aula vê apenas EBD e Configurações", () => {
    expect(menusVisiveis(pessoa({ professor_ebd: true }))).toEqual(["ebd", "settings"]);
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

  it("professor abre a EBD; administrador não vê Billing; responsável vê tudo", () => {
    expect(menusVisiveis(pessoa({ professor_ebd: true }))).toContain("ebd");
    expect(menusVisiveis(pessoa({ role: "admin" }))).not.toContain("billing");
    expect(menusVisiveis(pessoa({ role: "owner" }))).toContain("billing");
  });
});

describe("acessosDaPessoa e podeNoModulo", () => {
  it("as autorizações antigas da ficha continuam valendo, somadas aos cargos", () => {
    expect(acessosDaPessoa(["events"], { pode_acompanhar: true, pode_gerir_ebd: false })).toEqual([
      "dashboard",
      "acompanhamento",
      "membros",
      "events",
    ]);
    // Quem tem autorização na ficha continua com o painel.
    expect(acessosDaPessoa([], { pode_acompanhar: false, pode_gerir_ebd: true })).toEqual(["dashboard", "ebd"]);
  });

  it("módulo desconhecido vindo do banco é ignorado", () => {
    expect(acessosDaPessoa(["billing", "prayers"], { pode_acompanhar: false, pode_gerir_ebd: false })).toEqual([]);
  });

  it("quem administra pode em qualquer módulo; membro só no liberado", () => {
    expect(podeNoModulo({ role: "admin", acessos: [] }, "campaigns")).toBe(true);
    expect(podeNoModulo({ role: "member", acessos: ["events"] }, "events")).toBe(true);
    expect(podeNoModulo({ role: "member", acessos: ["events"] }, "campaigns")).toBe(false);
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
