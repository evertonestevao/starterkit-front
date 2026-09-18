import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import {
  createPublicSubmissionService,
  type PublicSubmissionRepository,
} from "./publicSubmissionService";

const IGREJA = "11111111-1111-4111-8111-111111111111";

function build() {
  const repo: PublicSubmissionRepository = {
    insertPrayerRequest: vi.fn(async () => {}),
    insertVisitor: vi.fn(async () => {}),
    signUpForEvent: vi.fn(async () => {}),
  };
  return { repo, service: createPublicSubmissionService(repo) };
}

describe("submitPrayerRequest", () => {
  it("aceita pedido anônimo — muita gente só pede se não precisar se identificar", async () => {
    const { repo, service } = build();

    await service.submitPrayerRequest({ churchId: IGREJA, name: "   ", message: "Pela minha mãe" });

    expect(repo.insertPrayerRequest).toHaveBeenCalledWith({
      churchId: IGREJA,
      name: null,
      message: "Pela minha mãe",
    });
  });

  it("recusa pedido vazio com mensagem para o visitante, não com tela de erro", async () => {
    const { repo, service } = build();

    const err = await service.submitPrayerRequest({ churchId: IGREJA, message: "  " }).catch((e) => e);

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(isAppError(err) && err.message).toBe("Escreva o seu pedido");
    expect(repo.insertPrayerRequest).not.toHaveBeenCalled();
  });

  it("tem teto de tamanho — a página é aberta a qualquer um", async () => {
    const { repo, service } = build();

    const err = await service
      .submitPrayerRequest({ churchId: IGREJA, message: "a".repeat(2001) })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.insertPrayerRequest).not.toHaveBeenCalled();
  });

  it("id de igreja que não é uuid não chega ao banco", async () => {
    const { repo, service } = build();

    await service.submitPrayerRequest({ churchId: "'; drop table x;--", message: "oi oi" }).catch(() => {});

    expect(repo.insertPrayerRequest).not.toHaveBeenCalled();
  });
});

describe("submitVisitor e submitEventSignup", () => {
  it("visitante precisa de nome e de um contato para a igreja retornar", async () => {
    const { repo, service } = build();

    const err = await service.submitVisitor({ churchId: IGREJA, name: "Ana", contact: "" }).catch((e) => e);

    expect(isAppError(err) && err.message).toBe("Deixe um WhatsApp, telefone ou email");
    expect(repo.insertVisitor).not.toHaveBeenCalled();
  });

  it("inscrição aponta para o evento e limpa espaços antes de gravar", async () => {
    const { repo, service } = build();
    const EVENTO = "22222222-2222-4222-8222-222222222222";

    await service.submitEventSignup({
      eventId: EVENTO,
      personName: " Ana Lima ",
      contact: " 11 98888-7777 ",
    });

    expect(repo.signUpForEvent).toHaveBeenCalledWith({
      eventId: EVENTO,
      personName: "Ana Lima",
      contact: "11 98888-7777",
    });
  });

  it("não aceita mais evento digitado: sem id de evento, não grava", async () => {
    const { repo, service } = build();

    const err = await service
      .submitEventSignup({ eventName: "retirro", personName: "Ana", contact: "11988887777" })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.signUpForEvent).not.toHaveBeenCalled();
  });
});
