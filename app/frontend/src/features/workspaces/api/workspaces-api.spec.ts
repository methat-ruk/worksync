import { afterEach, describe, expect, it, vi } from "vitest";

const workspaceBody = {
  id: "workspace-1",
  name: "Product Team",
  slug: "product-team",
  createdAt: "2026-07-08T08:00:00.000Z",
  updatedAt: "2026-07-08T08:00:00.000Z",
  membershipRole: "OWNER"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("workspace API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("lists workspaces with the current bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          items: [workspaceBody],
          page: 1,
          pageSize: 20,
          total: 1
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { setAccessToken } = await import("@/lib/api/session-token");
    const { listWorkspaces } = await import("./workspaces-api");

    setAccessToken("access-token");
    const data = await listWorkspaces();

    const workspaceCall = fetchMock.mock.calls[0]!;
    const headers = workspaceCall[1].headers as Headers;
    expect(workspaceCall[0]).toBe(
      "http://localhost:4000/api/workspaces?page=1&pageSize=20"
    );
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(data.items[0]!.name).toBe("Product Team");
  });

  it("requests a later workspace page with the selected page size", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          items: [workspaceBody],
          page: 2,
          pageSize: 20,
          total: 21
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { setAccessToken } = await import("@/lib/api/session-token");
    const { listWorkspaces } = await import("./workspaces-api");

    setAccessToken("access-token");
    const data = await listWorkspaces({ page: 2, pageSize: 20 });

    expect(fetchMock.mock.calls[0]![0]).toBe(
      "http://localhost:4000/api/workspaces?page=2&pageSize=20"
    );
    expect(data).toMatchObject({ page: 2, pageSize: 20, total: 21 });
  });

  it("creates a workspace with trimmed input and current bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          success: true,
          message: "Workspace created",
          data: { workspace: workspaceBody }
        },
        201
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { setAccessToken } = await import("@/lib/api/session-token");
    const { createWorkspace } = await import("./workspaces-api");

    setAccessToken("access-token");
    const workspace = await createWorkspace({ name: " Product Team " });

    const workspaceCall = fetchMock.mock.calls[0]!;
    const init = workspaceCall[1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(init.body).toBe(JSON.stringify({ name: "Product Team" }));
    expect(workspace.membershipRole).toBe("OWNER");
  });
});
