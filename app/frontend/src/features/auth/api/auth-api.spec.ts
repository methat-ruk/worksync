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
});
