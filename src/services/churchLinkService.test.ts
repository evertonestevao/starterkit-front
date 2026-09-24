import { describe, expect, it, vi } from "vitest";
import { AppError, isAppError } from "@/lib/errors";
import type {
  ChurchLinkChurch,
  ChurchLinkDecision,
  ChurchLinkEnded,
  ChurchLinkMoved,
  ChurchLinkRequest,
  ChurchLinkRequested,
} from "@/types/churchLinks";
import {
  createChurchLinkService,
  type ChurchLinkActor,
  type ChurchLinkNotifier,
  type ChurchLinkRepository,
} from "./churchLinkService";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const IGREJA = "33333333-3333-4333-8333-333333333333";
const OUTRA = "44444444-4444-4444-8444-444444444444";
const PEDIDO = "55555555-5555-4555-8555-555555555555";
const EMPRESA_OUTRA = "22222222-2222-4222-8222-222222222222";
const TOKEN = "token-de-teste-com-tamanho-suficiente-123";

const ADMIN: ChurchLinkActor = { companyId: EMPRESA, role: "admin", userId: "u-1" };

function igreja(sobrescrever: Partial<ChurchLinkChurch> = {}): ChurchLinkChurch {
  return {
    id: IGREJA,
    name: "Comunidade da Graça",
    sobrenome: null,
    tipo: "subsede",
    publicCode: "graca",
    parentId: null,
    ...sobrescrever,
  };
}

function pedido(sobrescrever: Partial<ChurchLinkRequest> = {}): ChurchLinkRequest {
  return {
    id: PEDIDO,
    status: "pendente",
    tipoSolicitado: "subsede",
    tipoFinal: null,
    motivoRecusa: null,
    requestedAt: "2026-09-26T12:00:00Z",
    decidedAt: null,
    parentChurchId: IGREJA,
    childChurchId: OUTRA,
    parentName: "Comunidade da Graça",
    childName: "Graça Litoral",
    childAddress: null,
    childPublicCode: "litoral",
    solicitanteNome: "Pastor do Litoral",
    ...sobrescrever,
  };
}

function build(church: ChurchLinkChurch = igreja()) {
  const repo: ChurchLinkRepository = {
    listCompanyChurches: vi.fn(async () => [church]),
    getNeighbors: vi.fn(async () => ({ parent: null, children: [], congregacoesPorIgreja: {} })),
    listInvites: vi.fn(async () => []),
    listRequests: vi.fn(async () => []),
    listRequestsByInvite: vi.fn(async () => []),
    createInvite: vi.fn(async () => "invite-1"),
    revokeInvite: vi.fn(async () => true),
    getInviteByToken: vi.fn(async () => null),
    requestLink: vi.fn(
      async (): Promise<ChurchLinkRequested> => ({
        parentCompanyId: EMPRESA_OUTRA,
        parentChurchName: "Comunidade da Graça",
        childChurchName: "Graça Litoral",
        tipo: "subsede",
      }),
    ),
    cancelRequest: vi.fn(async () => true),
    decideRequest: vi.fn(
      async (): Promise<ChurchLinkDecision> => ({
        childCompanyId: EMPRESA_OUTRA,
        parentChurchName: "Comunidade da Graça",
        childChurchName: "Graça Litoral",
        tipo: "subsede",
        approved: true,
      }),
    ),
    changePosition: vi.fn(
      async (): Promise<ChurchLinkMoved> => ({
        childCompanyId: EMPRESA_OUTRA,
        childChurchName: "Vila Nova",
        parentChurchName: "Graça Zona Norte",
        tipo: "congregacao",
      }),
    ),
    endLink: vi.fn(
      async (): Promise<ChurchLinkEnded> => ({
        otherCompanyId: EMPRESA_OUTRA,
        otherChurchName: "Comunidade da Graça",
        ownChurchName: "Graça Litoral",
      }),
    ),
    listNotices: vi.fn(async () => []),
    dismissNotice: vi.fn(async () => true),
    listAdminEmails: vi.fn(async () => ["pastor@exemplo.com"]),
  };
  const notifier: ChurchLinkNotifier = {
    requested: vi.fn(async () => undefined),
    decided: vi.fn(async () => undefined),
    moved: vi.fn(async () => undefined),
    ended: vi.fn(async () => undefined),
  };
  const rateLimiter = { consume: vi.fn(async () => undefined) };
  const log = { error: vi.fn() };
  const service = createChurchLinkService({
    repo,
    notifier,
    rateLimiter,
    makeToken: () => TOKEN,
    hashToken: (t) => `hash:${t}`,
    appUrl: "https://app.exemplo.com/",
    now: () => new Date("2026-09-26T12:00:00Z"),
    log,
  });
  return { repo, notifier, rateLimiter, log, service };
}

async function erroDe(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("esperava erro");
}

// Validade e limite não têm padrão: a igreja escolhe (aqui, 30 dias e 20 pedidos).
const ESCOLHA = { validityDays: 30, maxUses: 20 } as const;

describe("createInvite (o link da igreja-mãe)", () => {
  it("gera o link, guarda só o hash e devolve o texto do token uma vez", async () => {
    const { repo, service } = build();

    const r = await service.createInvite(ADMIN, { churchId: IGREJA, tipo: "subsede", ...ESCOLHA });

    expect(r.url).toBe(`https://app.exemplo.com/vinculo/${TOKEN}`);
    expect(repo.createInvite).toHaveBeenCalledWith({
      churchId: IGREJA,
      tipo: "subsede",
      tokenHash: `hash:${TOKEN}`,
      expiresAt: "2026-10-26T12:00:00.000Z", // 30 dias
      maxUses: 20,
    });
    // O texto puro nunca vai para o repositório.
    expect(JSON.stringify(vi.mocked(repo.createInvite).mock.calls)).not.toContain(`"${TOKEN}"`);
  });

  it("cada validade escolhida vira a data certa, e sem validade não guarda data", async () => {
    const { repo, service } = build();

    for (const [dias, esperado] of [
      [7, "2026-10-03T12:00:00.000Z"],
      [15, "2026-10-11T12:00:00.000Z"],
      [30, "2026-10-26T12:00:00.000Z"],
      [null, null],
    ] as const) {
      await service.createInvite(ADMIN, { churchId: IGREJA, tipo: "subsede", validityDays: dias, maxUses: 5 });
      expect(repo.createInvite).toHaveBeenLastCalledWith(expect.objectContaining({ expiresAt: esperado }));
    }
  });

  it("aceita um limite de pedidos, ou ilimitado (null), e recusa valores fora do intervalo", async () => {
    const { repo, service } = build();

    await service.createInvite(ADMIN, { churchId: IGREJA, tipo: "subsede", validityDays: 7, maxUses: 3 });
    expect(repo.createInvite).toHaveBeenLastCalledWith(expect.objectContaining({ maxUses: 3 }));
    await service.createInvite(ADMIN, { churchId: IGREJA, tipo: "subsede", validityDays: 7, maxUses: null });
    expect(repo.createInvite).toHaveBeenLastCalledWith(expect.objectContaining({ maxUses: null }));

    for (const ruim of [0, 1001, 2.5, -1]) {
      const err = await erroDe(
        service.createInvite(ADMIN, { churchId: IGREJA, tipo: "subsede", validityDays: 7, maxUses: ruim }),
      );
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(repo.createInvite).toHaveBeenCalledTimes(2);
  });

  it("não há padrão: sem escolher a validade ou o limite, o link não é gerado", async () => {
    const { repo, service } = build();

    for (const incompleto of [
      { churchId: IGREJA, tipo: "subsede", maxUses: 5 },
      { churchId: IGREJA, tipo: "subsede", validityDays: 30 },
      { churchId: IGREJA, tipo: "subsede", validityDays: 10, maxUses: 5 },
    ]) {
      const err = await erroDe(service.createInvite(ADMIN, incompleto));
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(repo.createInvite).not.toHaveBeenCalled();
  });

  it("limita a criação de links por pessoa", async () => {
    const { rateLimiter, repo, service } = build();

    await service.createInvite(ADMIN, { churchId: IGREJA, tipo: "subsede", ...ESCOLHA });
    expect(rateLimiter.consume).toHaveBeenCalledWith(`church-link:${EMPRESA}:u-1`);

    vi.mocked(rateLimiter.consume).mockRejectedValueOnce(new AppError("rate_limited", "Muitas tentativas."));
    const err = await erroDe(service.createInvite(ADMIN, { churchId: IGREJA, tipo: "subsede", ...ESCOLHA }));
    expect(isAppError(err) && err.code).toBe("rate_limited");
    expect(repo.createInvite).toHaveBeenCalledTimes(1);
  });

  it("member não gera link; igreja de outra empresa não é da equipe", async () => {
    const { repo, service } = build();

    const proibido = await erroDe(service.createInvite({ ...ADMIN, role: "member" }, { churchId: IGREJA, tipo: "subsede", ...ESCOLHA }));
    expect(isAppError(proibido) && proibido.code).toBe("forbidden");

    const alheia = await erroDe(service.createInvite(ADMIN, { churchId: OUTRA, tipo: "subsede", ...ESCOLHA }));
    expect(isAppError(alheia) && alheia.code).toBe("not_found");
    expect(repo.createInvite).not.toHaveBeenCalled();
  });

  it("congregação não gera link; subsede com superior só de congregação", async () => {
    const cong = build(igreja({ tipo: "congregacao", parentId: "x" }));
    expect(isAppError(await erroDe(cong.service.createInvite(ADMIN, { churchId: IGREJA, tipo: "congregacao", ...ESCOLHA })))).toBe(true);

    const sub = build(igreja({ tipo: "subsede", parentId: "sede-1" }));
    const err = await erroDe(sub.service.createInvite(ADMIN, { churchId: IGREJA, tipo: "subsede", ...ESCOLHA }));
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(sub.repo.createInvite).not.toHaveBeenCalled();

    await sub.service.createInvite(ADMIN, { churchId: IGREJA, tipo: "congregacao", ...ESCOLHA });
    expect(sub.repo.createInvite).toHaveBeenCalledTimes(1);
  });
});

describe("previewInvite", () => {
  it("token curto ou enorme nem chega ao banco; a consulta usa o hash", async () => {
    const { repo, service } = build();

    expect(await service.previewInvite("curto")).toBeNull();
    expect(await service.previewInvite("x".repeat(500))).toBeNull();
    expect(repo.getInviteByToken).not.toHaveBeenCalled();

    await service.previewInvite(TOKEN);
    expect(repo.getInviteByToken).toHaveBeenCalledWith(`hash:${TOKEN}`);
  });
});

describe("requestLink (a igreja de baixo pede)", () => {
  it("gera o pedido e avisa por e-mail os admins da superior", async () => {
    const { repo, notifier, service } = build();

    const r = await service.requestLink(ADMIN, { token: TOKEN, churchId: IGREJA });

    expect(r.parentChurchName).toBe("Comunidade da Graça");
    expect(repo.requestLink).toHaveBeenCalledWith({ tokenHash: `hash:${TOKEN}`, childChurchId: IGREJA });
    expect(repo.listAdminEmails).toHaveBeenCalledWith(EMPRESA_OUTRA);
    expect(notifier.requested).toHaveBeenCalledWith({
      to: ["pastor@exemplo.com"],
      parentName: "Comunidade da Graça",
      childName: "Graça Litoral",
      tipo: "subsede",
    });
  });

  it("falha no e-mail não desfaz o pedido", async () => {
    const { repo, notifier, log, service } = build();
    vi.mocked(notifier.requested).mockRejectedValueOnce(new Error("smtp fora"));

    const r = await service.requestLink(ADMIN, { token: TOKEN, churchId: IGREJA });

    expect(r.childChurchName).toBe("Graça Litoral");
    expect(repo.requestLink).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalled();
  });

  it("só pede por igreja da empresa ativa, e member não pede", async () => {
    const { repo, service } = build();

    const alheia = await erroDe(service.requestLink(ADMIN, { token: TOKEN, churchId: OUTRA }));
    expect(isAppError(alheia) && alheia.code).toBe("not_found");

    const proibido = await erroDe(service.requestLink({ ...ADMIN, role: "member" }, { token: TOKEN, churchId: IGREJA }));
    expect(isAppError(proibido) && proibido.code).toBe("forbidden");
    expect(repo.requestLink).not.toHaveBeenCalled();
  });
});

describe("decideRequest (só a superior muda a árvore)", () => {
  it("aprovar com a posição ajustada leva o tipo e avisa quem pediu", async () => {
    const { repo, notifier, service } = build();

    await service.decideRequest(ADMIN, { requestId: PEDIDO, approve: true, tipo: "congregacao" });

    expect(repo.decideRequest).toHaveBeenCalledWith({
      requestId: PEDIDO,
      approve: true,
      tipo: "congregacao",
      motivo: null,
    });
    expect(notifier.decided).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["pastor@exemplo.com"], approved: true, motivo: null }),
    );
  });

  it("aprovar sem informar posição mantém a que foi pedida (o banco decide)", async () => {
    const { repo, service } = build();

    await service.decideRequest(ADMIN, { requestId: PEDIDO, approve: true });

    expect(repo.decideRequest).toHaveBeenCalledWith(expect.objectContaining({ tipo: null }));
  });

  it("recusar leva o motivo (opcional) e ignora posição", async () => {
    const { repo, notifier, service } = build();

    await service.decideRequest(ADMIN, { requestId: PEDIDO, approve: false, tipo: "subsede", motivo: "  Não conhecemos.  " });
    expect(repo.decideRequest).toHaveBeenCalledWith({
      requestId: PEDIDO,
      approve: false,
      tipo: null,
      motivo: "Não conhecemos.",
    });
    expect(notifier.decided).toHaveBeenCalledWith(expect.objectContaining({ motivo: "Não conhecemos." }));

    await service.decideRequest(ADMIN, { requestId: PEDIDO, approve: false });
    expect(repo.decideRequest).toHaveBeenLastCalledWith(expect.objectContaining({ motivo: null }));
  });

  it("member não decide, e posição inválida não chega ao banco", async () => {
    const { repo, service } = build();

    const proibido = await erroDe(service.decideRequest({ ...ADMIN, role: "member" }, { requestId: PEDIDO, approve: true }));
    expect(isAppError(proibido) && proibido.code).toBe("forbidden");

    const ruim = await erroDe(service.decideRequest(ADMIN, { requestId: PEDIDO, approve: true, tipo: "sede" }));
    expect(isAppError(ruim) && ruim.code).toBe("validation_error");
    expect(repo.decideRequest).not.toHaveBeenCalled();
  });
});

describe("changePosition (mover dentro da árvore)", () => {
  it("move e avisa a igreja movida", async () => {
    const { repo, notifier, service } = build();

    await service.changePosition(ADMIN, { childId: OUTRA, tipo: "congregacao", newParentId: IGREJA });

    expect(repo.changePosition).toHaveBeenCalledWith({ childId: OUTRA, tipo: "congregacao", newParentId: IGREJA });
    expect(notifier.moved).toHaveBeenCalledWith({
      to: ["pastor@exemplo.com"],
      parentName: "Graça Zona Norte",
      childName: "Vila Nova",
      tipo: "congregacao",
    });
  });

  it("mesma equipe nos dois lados: ninguém para avisar", async () => {
    const { repo, notifier, service } = build();
    vi.mocked(repo.changePosition).mockResolvedValueOnce({
      childCompanyId: null,
      childChurchName: "A",
      parentChurchName: "B",
      tipo: "subsede",
    });

    await service.changePosition(ADMIN, { childId: OUTRA, tipo: "subsede", newParentId: null });

    expect(repo.listAdminEmails).not.toHaveBeenCalled();
    expect(notifier.moved).not.toHaveBeenCalled();
  });

  it("recusa posição e ids inválidos", async () => {
    const { repo, service } = build();

    for (const ruim of [
      { childId: OUTRA, tipo: "sede", newParentId: null },
      { childId: "x", tipo: "subsede", newParentId: null },
      { childId: OUTRA, tipo: "subsede", newParentId: "não-é-uuid" },
    ]) {
      expect(isAppError(await erroDe(service.changePosition(ADMIN, ruim)))).toBe(true);
    }
    expect(repo.changePosition).not.toHaveBeenCalled();
  });
});

describe("endLink, cancelamentos e avisos", () => {
  it("desfaz e avisa a outra ponta; mesma empresa não avisa ninguém", async () => {
    const { repo, notifier, service } = build();

    await service.endLink(ADMIN, IGREJA);
    expect(notifier.ended).toHaveBeenCalledWith({
      to: ["pastor@exemplo.com"],
      endedByName: "Graça Litoral",
      otherName: "Comunidade da Graça",
    });

    vi.mocked(repo.endLink).mockResolvedValueOnce({ otherCompanyId: null, otherChurchName: "A", ownChurchName: "B" });
    vi.mocked(notifier.ended).mockClear();
    await service.endLink(ADMIN, IGREJA);
    expect(notifier.ended).not.toHaveBeenCalled();
  });

  it("revogar link ou cancelar pedido que já não existe é erro claro", async () => {
    const { repo, service } = build();
    vi.mocked(repo.revokeInvite).mockResolvedValueOnce(false);
    vi.mocked(repo.cancelRequest).mockResolvedValueOnce(false);

    const revogar = await erroDe(service.revokeInvite(ADMIN, PEDIDO));
    const cancelar = await erroDe(service.cancelRequest(ADMIN, PEDIDO));

    expect(isAppError(revogar) && revogar.code).toBe("not_found");
    expect(isAppError(cancelar) && cancelar.code).toBe("not_found");
  });

  it("member não vê os avisos de vínculo", async () => {
    const { repo, service } = build();

    expect(await service.listNotices({ ...ADMIN, role: "member" })).toEqual([]);
    expect(repo.listNotices).not.toHaveBeenCalled();
  });
});

describe("overview e myRequestsForInvite", () => {
  it("separa o que a igreja precisa decidir, o pedido dela e o histórico", async () => {
    const { repo, service } = build();
    vi.mocked(repo.listRequests).mockResolvedValueOnce([
      pedido({ id: "a", parentChurchId: IGREJA, childChurchId: OUTRA, status: "pendente" }),
      pedido({ id: "b", parentChurchId: OUTRA, childChurchId: IGREJA, status: "pendente" }),
      pedido({ id: "c", parentChurchId: IGREJA, childChurchId: OUTRA, status: "recusado" }),
    ]);

    const o = await service.overview(ADMIN, IGREJA);

    expect(o.incomingPending.map((r) => r.id)).toEqual(["a"]);
    expect(o.myPending?.id).toBe("b");
    expect(o.history.map((r) => r.id)).toEqual(["c"]);
    expect(o.canInvite).toEqual(["subsede", "congregacao"]);
  });

  it("devolve as congregações de cada subsede ligada, para a contagem da tela", async () => {
    const { repo, service } = build();
    const sub = { id: "sub-1", name: "Graça Norte", sobrenome: null, tipo: "subsede" as const, publicCode: "sub1" };
    const cong = { id: "cong-1", name: "Vila Nova", sobrenome: null, tipo: "congregacao" as const, publicCode: "c1" };
    vi.mocked(repo.getNeighbors).mockResolvedValueOnce({
      parent: null,
      children: [sub],
      congregacoesPorIgreja: { "sub-1": [cong] },
    });

    const o = await service.overview(ADMIN, IGREJA);

    expect(o.children).toEqual([sub]);
    expect(o.congregacoesPorIgreja["sub-1"]).toEqual([cong]);
  });

  it("só devolve os pedidos de link feitos pelas igrejas da empresa ativa", async () => {
    const { repo, service } = build();
    vi.mocked(repo.listRequestsByInvite).mockResolvedValueOnce([
      pedido({ id: "meu", childChurchId: IGREJA }),
      pedido({ id: "alheio", childChurchId: OUTRA }),
    ]);

    const r = await service.myRequestsForInvite(ADMIN, "invite-1");

    expect(r.map((x) => x.id)).toEqual(["meu"]);
  });
});
