import { afterEach, describe, expect, it, vi } from "vitest";

const authBody = {
  success: true,
  message: "Session refreshed",
  data: {
    user: {
      id: "user-1",
      email: "ada@example.com",
      displayName: "Ada Lovelace",
      createdAt: "2026-06-23T00:00:00.000Z",
      updatedAt: "2026-06-23T00:00:00.000Z"
    },
    accessToken: "access-token",
    tokenType: "Bearer",
    expiresIn: 900
  }
};

describe("auth API client", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns authenticated and stores the refreshed access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(authBody), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { refreshSession } = await import("./auth-api");
    const { getAccessToken } = await import("@/lib/api/session-token");
    const outcome = await refreshSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe("authenticated");
    expect(getAccessToken()).toBe("access-token");
  });

  it("returns unauthenticated and clears the token for refresh 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: false, message: "Authentication required" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const { setAccessToken, getAccessToken } = await import(
      "@/lib/api/session-token"
    );
    const { refreshSession } = await import("./auth-api");
    setAccessToken("expired-token");

    const outcome = await refreshSession();

    expect(outcome).toEqual({ kind: "unauthenticated" });
    expect(getAccessToken()).toBeNull();
  });

  it("validates the current access-token session without refreshing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { user: authBody.data.user } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const { setAccessToken } = await import("@/lib/api/session-token");
    const { validateCurrentSession } = await import("./auth-api");
    setAccessToken("current-access-token");

    await expect(validateCurrentSession()).resolves.toEqual({ kind: "active" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/me"),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: expect.any(Headers)
      })
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("Authorization")).toBe(
      "Bearer current-access-token"
    );
  });

  it.each([
    [401, "inactive"],
    [503, "recoverable-error"]
  ])("classifies current-session validation %i as %s", async (status, kind) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: false, message: "Session unavailable" }),
          { status, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const { validateCurrentSession } = await import("./auth-api");

    await expect(validateCurrentSession()).resolves.toMatchObject({ kind });
  });

  it.each([
    [429, "Too many attempts"],
    [403, "Forbidden"],
    [500, "Internal server error"]
  ])("returns recoverable error for refresh %i", async (status, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, message }), {
          status,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    const { setAccessToken, getAccessToken } = await import(
      "@/lib/api/session-token"
    );
    const { refreshSession } = await import("./auth-api");
    setAccessToken("stale-token");

    const outcome = await refreshSession();

    expect(outcome.kind).toBe("recoverable-error");
    expect(getAccessToken()).toBeNull();
  });

  it("returns recoverable error for network and malformed-response failures", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const { refreshSession } = await import("./auth-api");

    expect((await refreshSession()).kind).toBe("recoverable-error");
    expect((await refreshSession()).kind).toBe("recoverable-error");
  });

  it("retries only the exact refresh conflict and preserves the token between attempts", async () => {
    vi.useFakeTimers();
    const conflict = () =>
      new Response(
        JSON.stringify({
          success: false,
          message: "Session refresh conflicted; retry shortly",
          data: { code: "REFRESH_CONCURRENCY_CONFLICT" }
        }),
        {
          status: 409,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "8"
          }
        }
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(
        new Response(JSON.stringify(authBody), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const { setAccessToken, getAccessToken } = await import(
      "@/lib/api/session-token"
    );
    const { refreshSession } = await import("./auth-api");
    setAccessToken("current-access-token");

    const result = refreshSession();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(getAccessToken()).toBe("current-access-token");
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toMatchObject({ kind: "authenticated" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getAccessToken()).toBe("access-token");
  });

  it("clears the token after bounded conflict retry exhaustion", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            success: false,
            message: "Session refresh conflicted; retry shortly",
            data: { code: "REFRESH_CONCURRENCY_CONFLICT" }
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" }
          }
        )
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const { setAccessToken, getAccessToken } = await import(
      "@/lib/api/session-token"
    );
    const { refreshSession } = await import("./auth-api");
    setAccessToken("current-access-token");

    const result = refreshSession();
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(result).resolves.toMatchObject({ kind: "recoverable-error" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getAccessToken()).toBeNull();
  });

  it("does not retry a different 409 error code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          message: "Conflict",
          data: { code: "RESOURCE_CONFLICT" }
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const { refreshSession } = await import("./auth-api");

    await expect(refreshSession()).resolves.toMatchObject({
      kind: "recoverable-error"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [null, 1_000],
    ["invalid", 1_000],
    ["0", 0],
    ["1", 1_000],
    ["30", 1_000]
  ])("bounds Retry-After %s to %i ms", async (header, expected) => {
    const { refreshConflictDelayMs } = await import("./auth-api");
    expect(refreshConflictDelayMs(header)).toBe(expected);
  });
});
