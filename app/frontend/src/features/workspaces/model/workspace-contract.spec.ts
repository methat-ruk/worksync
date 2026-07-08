import { describe, expect, it } from "vitest";

import {
  createWorkspaceInputSchema,
  workspaceListResponseSchema,
  workspaceResponseSchema
} from "./workspace-contract";

const workspaceBody = {
  id: "workspace-1",
  name: "Product Team",
  slug: "product-team",
  createdAt: "2026-07-08T08:00:00.000Z",
  updatedAt: "2026-07-08T08:00:00.000Z",
  membershipRole: "OWNER"
};

describe("workspace contract schemas", () => {
  it("parses the documented workspace list envelope", () => {
    const parsed = workspaceListResponseSchema.parse({
      success: true,
      data: {
        items: [workspaceBody],
        page: 1,
        pageSize: 20,
        total: 1
      }
    });

    const firstWorkspace = parsed.data.items[0]!;
    expect(firstWorkspace.membershipRole).toBe("OWNER");
    expect(firstWorkspace.createdAt).toBeInstanceOf(Date);
  });

  it("parses the documented create workspace envelope", () => {
    const parsed = workspaceResponseSchema.parse({
      success: true,
      message: "Workspace created",
      data: { workspace: workspaceBody }
    });

    expect(parsed.data.workspace.slug).toBe("product-team");
    expect(parsed.data.workspace.updatedAt).toBeInstanceOf(Date);
  });

  it("trims and bounds create workspace input", () => {
    expect(createWorkspaceInputSchema.parse({ name: " Product Team " })).toEqual({
      name: "Product Team"
    });
    expect(() => createWorkspaceInputSchema.parse({ name: " " })).toThrow();
    expect(() =>
      createWorkspaceInputSchema.parse({ name: "a".repeat(101) })
    ).toThrow();
  });
});
