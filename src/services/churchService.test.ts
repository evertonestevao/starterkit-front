import { describe, expect, it } from "vitest";
import { pickTemplateIdForChurch } from "./churchService";

const root = {
  id: "root",
  parent_id: null,
  template_mode: "custom" as const,
  template_id: "tpl-dark",
};

const child = {
  id: "child",
  parent_id: "root",
  template_mode: "inherit" as const,
  template_id: null,
};

const customParent = {
  id: "mid",
  parent_id: "root",
  template_mode: "custom" as const,
  template_id: "tpl-classico",
};

describe("pickTemplateIdForChurch", () => {
  it("herda o template da sede quando o filho está em inherit", () => {
    expect(pickTemplateIdForChurch(child, [root])).toBe("tpl-dark");
  });

  it("usa o template custom mais próximo na hierarquia", () => {
    const branchWithCustomAncestor = {
      id: "branch-2",
      parent_id: "mid",
      template_mode: "inherit" as const,
      template_id: null,
    };

    expect(
      pickTemplateIdForChurch(branchWithCustomAncestor, [
        customParent,
        root,
        child,
      ]),
    ).toBe("tpl-classico");
  });

  it("retorna null quando não há template disponível", () => {
    const orphan = {
      id: "orphan",
      parent_id: null,
      template_mode: "inherit" as const,
      template_id: null,
    };

    expect(pickTemplateIdForChurch(orphan, [orphan])).toBeNull();
  });
});
