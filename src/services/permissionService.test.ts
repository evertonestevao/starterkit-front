import { describe, expect, it } from "vitest";
import { defineRole, hasCapability, permissionService } from "./permissionService";

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

  it("papel desconhecido nega tudo (default seguro)", () => {
    expect(permissionService.canManageMembers("papel-fantasma")).toBe(false);
    expect(permissionService.canManageBilling("papel-fantasma")).toBe(false);
    expect(permissionService.canChangeRole("papel-fantasma", "member")).toBe(false);
    // e ninguém age sobre um papel desconhecido com level 0? owner (3) > 0 sim:
    expect(permissionService.canRemoveMember("owner", "papel-fantasma")).toBe(true);
  });

  it("papel customizado registrado via defineRole funciona sem tocar nos fixos", () => {
    defineRole("auditor", { level: 1, capabilities: new Set(["audit.view"]) });

    expect(permissionService.canViewAudit("auditor")).toBe(true);
    expect(permissionService.canManageMembers("auditor")).toBe(false);
    expect(hasCapability("auditor", "billing.manage")).toBe(false);
    // hierarquia: admin (2) gerencia auditor (1); auditor não gerencia ninguém
    expect(permissionService.canRemoveMember("admin", "auditor")).toBe(true);
    expect(permissionService.canRemoveMember("auditor", "member")).toBe(false);
    // papéis originais intactos
    expect(permissionService.canManageBilling("owner")).toBe(true);
    expect(permissionService.canManageMembers("member")).toBe(false);
  });
});
