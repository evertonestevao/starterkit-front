import { describe, expect, it } from "vitest";
import {
  acessosDaPessoa,
  celula,
  escolhasParaGravar,
  menusVisiveis,
  podeNoModulo,
  resolverAcessos,
  type LinhaAcesso,
  type PessoaAcesso,
} from "./menuPermissoes";

const SECRETARIO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DIACONO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
  it("membro sem cargo liberado vê só o básico", () => {
    expect(menusVisiveis(pessoa({}))).toEqual(["dashboard", "programacao", "events", "relationships", "settings"]);
  });

  it("módulo liberado por cargo abre o menu dele, e só ele", () => {
    const menus = menusVisiveis(pessoa({ acessos: ["campaigns"] }));
    expect(menus).toContain("campaigns");
    expect(menus).not.toContain("membros");
    expect(menus).not.toContain("prayers");
    expect(menus).not.toContain("billing");
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
      "acompanhamento",
      "membros",
      "events",
    ]);
    expect(acessosDaPessoa([], { pode_acompanhar: false, pode_gerir_ebd: true })).toEqual(["ebd"]);
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
    expect(celula(resolverAcessos([SECRETARIO], []), SECRETARIO, "ebd")).toEqual({
      permitido: false,
      herdado: false,
      herdadoDe: null,
      propria: false,
    });
  });

  it("a igreja acima mais próxima vence; a própria vence todas", () => {
    const linhas = [linha(SECRETARIO, "ebd", false, 2, "Sede"), linha(SECRETARIO, "ebd", true, 1, "Subsede")];
    expect(celula(resolverAcessos([SECRETARIO], linhas), SECRETARIO, "ebd")).toMatchObject({
      permitido: true,
      herdadoDe: "Subsede",
      propria: false,
    });

    const comPropria = [...linhas, linha(SECRETARIO, "ebd", false, 0, "Cong")];
    expect(celula(resolverAcessos([SECRETARIO], comPropria), SECRETARIO, "ebd")).toMatchObject({
      permitido: false,
      herdado: true,
      propria: true,
    });
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
      [SECRETARIO],
      deCima,
    );
    expect(gravar).toEqual([
      { cargoId: SECRETARIO, modulo: "ebd", permitido: true },
      { cargoId: SECRETARIO, modulo: "campaigns", permitido: true },
    ]);
    // Com isso gravado, a sede tirar a EBD depois não muda nada aqui.
    const depois = [linha(SECRETARIO, "ebd", false, 1), linha(SECRETARIO, "ebd", true, 0, "Cong")];
    expect(celula(resolverAcessos([SECRETARIO], depois), SECRETARIO, "ebd")?.permitido).toBe(true);
  });

  it("salvar sem mudar nada, ainda seguindo a de cima, continua seguindo", () => {
    expect(escolhasParaGravar([{ cargoId: SECRETARIO, modulo: "ebd", permitido: true }], [SECRETARIO], deCima)).toEqual(
      [],
    );
  });

  it("quem já tem configuração própria continua com ela, mesmo ficando igual à de cima", () => {
    const linhas = [...deCima, linha(SECRETARIO, "ebd", false, 0, "Cong")];
    expect(escolhasParaGravar([{ cargoId: SECRETARIO, modulo: "ebd", permitido: true }], [SECRETARIO], linhas)).toEqual([
      { cargoId: SECRETARIO, modulo: "ebd", permitido: true },
    ]);
  });
});
