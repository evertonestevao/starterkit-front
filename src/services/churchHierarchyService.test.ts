import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import {
  allowedParents,
  createChurchHierarchyService,
  tipoAceitaPai,
  toTreeOrder,
  type ChurchHierarchyRepository,
  type HierarchyChurch,
} from "./churchHierarchyService";

const SEDE = "10000000-0000-4000-8000-000000000001";
const SUB_X = "10000000-0000-4000-8000-000000000002";
const SUB_Y = "10000000-0000-4000-8000-000000000003";
const CONG_A = "10000000-0000-4000-8000-000000000004";
const CONG_B = "10000000-0000-4000-8000-000000000005";

function igreja(id: string, tipo: HierarchyChurch["tipo"], parentId: string | null, path: string): HierarchyChurch {
  return { id, name: path.split(".").pop()!, publicCode: id, tipo, parentId, path, companyId: id };
}

// Sede com Y ligada; X ainda solta (a sede dela entra depois).
const ARVORE: HierarchyChurch[] = [
  igreja(SEDE, "sede", null, "sede"),
  igreja(SUB_Y, "subsede", SEDE, "sede.y"),
  igreja(CONG_B, "congregacao", SUB_Y, "sede.y.b"),
  igreja(SUB_X, "subsede", null, "x"),
  igreja(CONG_A, "congregacao", SUB_X, "x.a"),
];

function build(churches = ARVORE) {
  const repo: ChurchHierarchyRepository = {
    listChurches: vi.fn(async () => churches),
    setHierarchy: vi.fn(async () => undefined),
  };
  return { repo, service: createChurchHierarchyService(repo) };
}

async function erroDe(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("esperava erro");
}

describe("tipoAceitaPai", () => {
  it("sede é sempre raiz", () => {
    expect(tipoAceitaPai("sede", null)).toBe(true);
    expect(tipoAceitaPai("sede", "sede")).toBe(false);
  });

  it("subsede pode ficar solta ou abaixo de uma sede", () => {
    expect(tipoAceitaPai("subsede", null)).toBe(true);
    expect(tipoAceitaPai("subsede", "sede")).toBe(true);
    expect(tipoAceitaPai("subsede", "subsede")).toBe(false);
  });

  it("congregação precisa de sede ou subsede acima", () => {
    expect(tipoAceitaPai("congregacao", null)).toBe(false);
    expect(tipoAceitaPai("congregacao", "subsede")).toBe(true);
    expect(tipoAceitaPai("congregacao", "sede")).toBe(true);
    expect(tipoAceitaPai("congregacao", "congregacao")).toBe(false);
  });
});

describe("allowedParents", () => {
  it("subsede solta pode ir só para a sede", () => {
    const x = ARVORE.find((c) => c.id === SUB_X)!;
    expect(allowedParents(x, "subsede", ARVORE).map((c) => c.id)).toEqual([SEDE]);
  });

  it("nunca oferece a própria subárvore (evita ciclo)", () => {
    const x = ARVORE.find((c) => c.id === SUB_X)!;
    const ids = allowedParents(x, "congregacao", ARVORE).map((c) => c.id);
    expect(ids).not.toContain(SUB_X);
    expect(ids).not.toContain(CONG_A);
    expect(ids).toEqual([SEDE, SUB_Y]);
  });
});

describe("toTreeOrder", () => {
  it("põe o pai antes dos filhos e calcula a profundidade", () => {
    const ordem = toTreeOrder(ARVORE).map((c) => [c.path, c.depth]);
    expect(ordem).toEqual([
      ["sede", 0],
      ["sede.y", 1],
      ["sede.y.b", 2],
      ["x", 0],
      ["x.a", 1],
    ]);
  });
});

describe("setHierarchy", () => {
  it("liga a subsede solta à sede preenchendo só o parent", async () => {
    const { repo, service } = build();

    await service.setHierarchy({ churchId: SUB_X, tipo: "subsede", parentId: SEDE });

    expect(repo.setHierarchy).toHaveBeenCalledWith({ churchId: SUB_X, tipo: "subsede", parentId: SEDE });
  });

  it("parent vazio do formulário vira igreja sem pai", async () => {
    const { repo, service } = build();

    await service.setHierarchy({ churchId: SUB_Y, tipo: "subsede", parentId: "" });

    expect(repo.setHierarchy).toHaveBeenCalledWith({ churchId: SUB_Y, tipo: "subsede", parentId: null });
  });

  it("recusa congregação abaixo de congregação", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.setHierarchy({ churchId: CONG_B, tipo: "congregacao", parentId: CONG_A }));

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.setHierarchy).not.toHaveBeenCalled();
  });

  it("recusa congregação sem igreja acima", async () => {
    const { service } = build();

    const err = await erroDe(service.setHierarchy({ churchId: CONG_A, tipo: "congregacao", parentId: "" }));

    expect(isAppError(err) && err.message).toMatch(/precisa de uma igreja acima/);
  });

  it("recusa pôr a igreja abaixo de uma filha dela", async () => {
    const { service } = build();
    const sedeVirando = { churchId: SEDE, tipo: "subsede", parentId: SUB_Y };

    const err = await erroDe(service.setHierarchy(sedeVirando));

    expect(isAppError(err) && err.message).toMatch(/abaixo dela mesma/);
  });

  it("recusa trocar o tipo quando as filhas ficariam inválidas", async () => {
    const { service } = build();

    // X tem a congregação A: virar congregação deixaria A abaixo de congregação.
    const err = await erroDe(service.setHierarchy({ churchId: SUB_X, tipo: "congregacao", parentId: SEDE }));

    expect(isAppError(err) && err.message).toMatch(/está abaixo desta igreja/);
  });

  it("recusa id que não é uuid antes de ir ao banco", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.setHierarchy({ churchId: "x", tipo: "sede", parentId: "" }));

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.listChurches).not.toHaveBeenCalled();
  });
});
