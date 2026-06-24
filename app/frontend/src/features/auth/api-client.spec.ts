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

  it("coalesces concurrent refresh attempts into one request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(authBody), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { refreshSession } = await import("./api-client");

    const [first, second, third] = await Promise.all([
      refreshSession(),
      refreshSession(),
      refreshSession()
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first?.accessToken).toBe("access-token");
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });
});
