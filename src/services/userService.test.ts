import { describe, expect, it } from "vitest";
import type { Profile } from "@/types/database";
import {
  AVATAR_MAX_BYTES,
  createUserService,
  validateAvatarFile,
  type UserRepository,
} from "./userService";

function makeRepo(updates: Array<Record<string, unknown>>): UserRepository {
  return {
    async getMyProfile() {
      return null as Profile | null;
    },
    async updateMyProfile(data) {
      updates.push(data);
    },
  };
}

describe("validateAvatarFile", () => {
  it("aceita jpeg/png/webp dentro do limite e devolve a extensão", () => {
    expect(validateAvatarFile({ type: "image/jpeg", size: 1024 })).toBe("jpg");
    expect(validateAvatarFile({ type: "image/png", size: AVATAR_MAX_BYTES })).toBe("png");
    expect(validateAvatarFile({ type: "image/webp", size: 500_000 })).toBe("webp");
  });

  it("rejeita tipo não permitido (inclusive svg, vetor de XSS)", () => {
    for (const type of ["image/svg+xml", "application/pdf", "text/html", ""]) {
      expect(() => validateAvatarFile({ type, size: 1024 })).toThrowError(
        expect.objectContaining({ code: "validation_error" }),
      );
    }
  });

  it("rejeita arquivo acima de 2MB e arquivo vazio", () => {
    expect(() =>
      validateAvatarFile({ type: "image/png", size: AVATAR_MAX_BYTES + 1 }),
    ).toThrowError(expect.objectContaining({ code: "validation_error" }));
    expect(() => validateAvatarFile({ type: "image/png", size: 0 })).toThrowError(
      expect.objectContaining({ code: "validation_error" }),
    );
  });
});

describe("userService.updateMyAvatar", () => {
  it("grava URL válida e rejeita valor que não é URL", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const service = createUserService(makeRepo(updates));

    await service.updateMyAvatar({ avatarUrl: "https://cdn.example.com/u/avatar.png?v=1" });
    expect(updates).toEqual([{ avatar_url: "https://cdn.example.com/u/avatar.png?v=1" }]);

    await expect(service.updateMyAvatar({ avatarUrl: "javascript:alert(1)" })).rejects.toMatchObject(
      { code: "validation_error" },
    );
    await expect(service.updateMyAvatar({ avatarUrl: 123 })).rejects.toMatchObject({
      code: "validation_error",
    });
  });
});
