import { describe, expect, it } from "vitest";
import { permissionService } from "./permissionService";

describe("permissionService", () => {
  it("owner e admin gerenciam membros; member não", () => {
    expect(permissionService.canManageMembers("owner")).toBe(true);
    expect(permissionService.canManageMembers("admin")).toBe(true);
    expect(permissionService.canManageMembers("member")).toBe(false);
  });

  it("só owner gerencia billing", () => {
    expect(permissionService.canManageBilling("owner")).toBe(true);
    expect(permissionService.canManageBilling("admin")).toBe(false);
    expect(permissionService.canManageBilling("member")).toBe(false);
  });

  it("owner altera papel de admin/member, mas ninguém altera owner", () => {
    expect(permissionService.canChangeRole("owner", "admin")).toBe(true);
    expect(permissionService.canChangeRole("owner", "member")).toBe(true);
    expect(permissionService.canChangeRole("owner", "owner")).toBe(false);
    expect(permissionService.canChangeRole("admin", "member")).toBe(true);
    expect(permissionService.canChangeRole("admin", "admin")).toBe(false);
    expect(permissionService.canChangeRole("member", "member")).toBe(false);
  });

  it("owner nunca é removível; admin remove só member", () => {
    expect(permissionService.canRemoveMember("owner", "owner")).toBe(false);
    expect(permissionService.canRemoveMember("owner", "admin")).toBe(true);
    expect(permissionService.canRemoveMember("admin", "member")).toBe(true);
    expect(permissionService.canRemoveMember("admin", "admin")).toBe(false);
    expect(permissionService.canRemoveMember("member", "member")).toBe(false);
  });
});
