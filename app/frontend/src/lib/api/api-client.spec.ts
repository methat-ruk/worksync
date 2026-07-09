import { afterEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("shared API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sends credentialed JSON requests with the current bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { apiRequest } = await import("./api-client");
    const { setAccessToken } = await import("./session-token");

    setAccessToken("access-token");
    await apiRequest(
      "/api/workspaces",
      {
        method: "POST",
        body: JSON.stringify({ name: "Product Team" })
      },
      { authenticated: true }
    );

    const call = fetchMock.mock.calls[0]!;
    const init = call[1] as RequestInit;
    const headers = init.headers as Headers;

    expect(call[0]).toBe("http://localhost:4000/api/workspaces");
    expect(init.credentials).toBe("include");
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("retries an authenticated request once after a refresh", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, message: "Expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    const refreshHandler = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("fetch", fetchMock);

    const { apiRequest, setRefreshSessionHandler } = await import("./api-client");
    setRefreshSessionHandler(refreshHandler);

    const response = await apiRequest(
      "/api/workspaces?page=1&pageSize=20",
      {},
      { authenticated: true }
    );

    expect(response.ok).toBe(true);
    expect(refreshHandler).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not loop when the retry remains unauthorized", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, message: "Expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: false, message: "Expired" }, 401));
    const refreshHandler = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("fetch", fetchMock);

    const { apiRequest, setRefreshSessionHandler } = await import("./api-client");
    setRefreshSessionHandler(refreshHandler);

    const response = await apiRequest(
      "/api/workspaces?page=1&pageSize=20",
      {},
      { authenticated: true }
    );

    expect(response.status).toBe(401);
    expect(refreshHandler).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("parses non-JSON failures into a safe API error", async () => {
    const { parseApiError, ApiError } = await import("./api-client");

    const error = await parseApiError(
      new Response("not json", {
        status: 500,
        headers: { "Content-Type": "text/plain" }
      })
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(error.body.message).toBe("Request failed");
  });
});
