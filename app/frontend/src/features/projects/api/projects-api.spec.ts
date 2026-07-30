import { afterEach, describe, expect, it, vi } from "vitest";

const projectBody = {
  id: "project-1",
  name: "WorkSync",
  key: "WSYNC",
  createdAt: "2026-07-30T08:00:00.000Z",
  updatedAt: "2026-07-30T08:00:00.000Z"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("project API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("lists an encoded workspace project page with authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          items: [projectBody],
          page: 2,
          pageSize: 20,
          total: 21
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { setAccessToken } = await import("@/lib/api/session-token");
    const { listProjects } = await import("./projects-api");
    setAccessToken("access-token");

    const data = await listProjects("workspace/one", {
      page: 2,
      pageSize: 20
    });

    const call = fetchMock.mock.calls[0]!;
    const headers = call[1].headers as Headers;
    expect(call[0]).toBe(
      "http://localhost:4000/api/workspaces/workspace%2Fone/projects?page=2&pageSize=20"
    );
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(data.items[0]!.key).toBe("WSYNC");
  });

  it("creates a project with normalized input and authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          success: true,
          message: "Project created",
          data: { project: projectBody }
        },
        201
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { setAccessToken } = await import("@/lib/api/session-token");
    const { createProject } = await import("./projects-api");
    setAccessToken("access-token");

    const project = await createProject("workspace-1", {
      name: " WorkSync ",
      key: " wsync "
    });

    const call = fetchMock.mock.calls[0]!;
    const init = call[1] as RequestInit;
    const headers = init.headers as Headers;
    expect(init.body).toBe(
      JSON.stringify({ name: "WorkSync", key: "WSYNC" })
    );
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(project.name).toBe("WorkSync");
  });
});
