import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
  refreshSession: vi.fn(),
  refreshSessionHandler: undefined as
    | (() => Promise<{ kind: string }>)
    | undefined,
  signUp: vi.fn(),
  validateCurrentSession: vi.fn()
}));

vi.mock("./api/auth-api", () => ({
  login: mocks.login,
  logout: mocks.logout,
  logoutAll: mocks.logoutAll,
  refreshSession: mocks.refreshSession,
  signUp: mocks.signUp,
  validateCurrentSession: mocks.validateCurrentSession
}));

vi.mock("@/lib/api/api-client", () => ({
  setRefreshSessionHandler: (handler: () => Promise<{ kind: string }>) => {
    mocks.refreshSessionHandler = handler;
  }
}));

import {
  bootstrapAuth,
  getAuthSnapshot,
  login,
  logoutAll,
  resetAuthStoreForTests,
  subscribe
} from "./auth-store";

const authData = {
  user: {
    id: "user-1",
    email: "ada@example.com",
    displayName: "Ada Lovelace",
    createdAt: new Date("2026-06-23T00:00:00.000Z"),
    updatedAt: new Date("2026-06-23T00:00:00.000Z")
  },
  accessToken: "access-token",
  tokenType: "Bearer" as const,
  expiresIn: 900
};

beforeEach(() => {
  mocks.login.mockReset();
  mocks.logout.mockReset();
  mocks.logoutAll.mockReset();
  mocks.refreshSession.mockReset();
  mocks.signUp.mockReset();
  mocks.validateCurrentSession.mockReset();
  resetAuthStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auth store refresh transitions", () => {
  it("coalesces concurrent bootstrap into one request and one publication", async () => {
    let resolveRefresh!: (value: {
      kind: "authenticated";
      data: typeof authData;
    }) => void;
    mocks.refreshSession.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );
    const listener = vi.fn();
    subscribe(listener);

    const first = bootstrapAuth();
    const second = bootstrapAuth();
    resolveRefresh({ kind: "authenticated", data: authData });

    await expect(first).resolves.toEqual({
      status: "authenticated",
      user: authData.user
    });
    await expect(second).resolves.toEqual({
      status: "authenticated",
      user: authData.user
    });
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not bootstrap again after authentication is decided", async () => {
    mocks.refreshSession.mockResolvedValue({
      kind: "authenticated",
      data: authData
    });
    await bootstrapAuth();

    await bootstrapAuth();

    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("distinguishes unauthenticated from recoverable failure and allows retry", async () => {
    mocks.refreshSession
      .mockResolvedValueOnce({
        kind: "recoverable-error",
        error: new Error("Temporarily unavailable")
      })
      .mockResolvedValueOnce({ kind: "unauthenticated" });

    await expect(bootstrapAuth()).resolves.toEqual({
      status: "recoverable-error",
      user: null
    });
    await expect(bootstrapAuth()).resolves.toEqual({
      status: "unauthenticated",
      user: null
    });
    expect(mocks.refreshSession).toHaveBeenCalledTimes(2);
  });

  it("enters recoverable state without sending refresh when lock acquisition rejects", async () => {
    vi.stubGlobal("navigator", {
      locks: {
        request: vi.fn().mockRejectedValue(new Error("lock unavailable"))
      }
    });

    await expect(bootstrapAuth()).resolves.toEqual({
      status: "recoverable-error",
      user: null
    });
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it("uses the same transition for simultaneous shared API refresh callbacks", async () => {
    const handler = mocks.refreshSessionHandler;
    expect(handler).toBeTypeOf("function");

    let resolveRefresh!: (value: {
      kind: "authenticated";
      data: typeof authData;
    }) => void;
    mocks.refreshSession.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );
    const listener = vi.fn();
    subscribe(listener);

    const first = handler!();
    const second = handler!();
    resolveRefresh({ kind: "authenticated", data: authData });

    await expect(first).resolves.toEqual({ kind: "refreshed" });
    await expect(second).resolves.toEqual({ kind: "refreshed" });
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getAuthSnapshot()).toEqual({
      status: "authenticated",
      user: authData.user
    });
  });

  it("refreshes an expired access token inside the logout-all lock", async () => {
    mocks.logoutAll
      .mockRejectedValueOnce({ status: 401 })
      .mockResolvedValueOnce(undefined);
    mocks.refreshSession.mockResolvedValue({
      kind: "authenticated",
      data: authData
    });

    await logoutAll();

    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(mocks.logoutAll).toHaveBeenCalledTimes(2);
    expect(getAuthSnapshot()).toEqual({
      status: "unauthenticated",
      user: null
    });
  });

  it("does not let a delayed invalidation clear a newer login", async () => {
    class TestBroadcastChannel {
      static instance: TestBroadcastChannel;
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      postMessage = vi.fn();
      close = vi.fn();

      constructor() {
        TestBroadcastChannel.instance = this;
      }
    }
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    resetAuthStoreForTests();
    const { setAccessToken } = await import("@/lib/api/session-token");
    setAccessToken("old-access-token");
    mocks.refreshSession.mockResolvedValue({
      kind: "authenticated",
      data: authData
    });
    await bootstrapAuth();

    let resolveValidation!: (value: { kind: "inactive" }) => void;
    mocks.validateCurrentSession.mockReturnValue(
      new Promise((resolve) => {
        resolveValidation = resolve;
      })
    );
    TestBroadcastChannel.instance.onmessage?.(
      new MessageEvent("message", {
        data: { type: "session-invalidated" }
      })
    );
    await vi.waitFor(() =>
      expect(getAuthSnapshot().status).toBe("loading")
    );

    const newerAuthData = {
      ...authData,
      accessToken: "new-access-token",
      user: { ...authData.user, displayName: "New Session" }
    };
    mocks.login.mockImplementation(async () => {
      setAccessToken(newerAuthData.accessToken);
      return newerAuthData;
    });
    await login("ada@example.com", "password");
    resolveValidation({ kind: "inactive" });

    await vi.waitFor(() =>
      expect(getAuthSnapshot()).toEqual({
        status: "authenticated",
        user: newerAuthData.user
      })
    );
  });

  it("clears the current session after authoritative invalidation", async () => {
    class TestBroadcastChannel {
      static instance: TestBroadcastChannel;
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      postMessage = vi.fn();
      close = vi.fn();

      constructor() {
        TestBroadcastChannel.instance = this;
      }
    }
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    resetAuthStoreForTests();
    const { getAccessToken, setAccessToken } = await import(
      "@/lib/api/session-token"
    );
    setAccessToken("revoked-access-token");
    mocks.refreshSession.mockResolvedValue({
      kind: "authenticated",
      data: authData
    });
    mocks.validateCurrentSession.mockResolvedValue({ kind: "inactive" });
    await bootstrapAuth();

    TestBroadcastChannel.instance.onmessage?.(
      new MessageEvent("message", {
        data: { type: "session-invalidated" }
      })
    );

    await vi.waitFor(() =>
      expect(getAuthSnapshot().status).toBe("unauthenticated")
    );
    expect(getAccessToken()).toBeNull();
  });

  it("reconciles an invalidation received during an in-flight validation", async () => {
    class TestBroadcastChannel {
      static instance: TestBroadcastChannel;
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      postMessage = vi.fn();
      close = vi.fn();

      constructor() {
        TestBroadcastChannel.instance = this;
      }
    }
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    resetAuthStoreForTests();
    const { getAccessToken, setAccessToken } = await import(
      "@/lib/api/session-token"
    );
    setAccessToken("current-access-token");
    mocks.refreshSession.mockResolvedValue({
      kind: "authenticated",
      data: authData
    });
    await bootstrapAuth();

    let resolveFirstValidation!: (value: { kind: "active" }) => void;
    mocks.validateCurrentSession
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstValidation = resolve;
        })
      )
      .mockResolvedValueOnce({ kind: "inactive" });
    const invalidationEvent = new MessageEvent("message", {
      data: { type: "session-invalidated" }
    });

    TestBroadcastChannel.instance.onmessage?.(invalidationEvent);
    await vi.waitFor(() =>
      expect(mocks.validateCurrentSession).toHaveBeenCalledTimes(1)
    );
    TestBroadcastChannel.instance.onmessage?.(invalidationEvent);
    resolveFirstValidation({ kind: "active" });

    await vi.waitFor(() =>
      expect(getAuthSnapshot().status).toBe("unauthenticated")
    );
    expect(mocks.validateCurrentSession).toHaveBeenCalledTimes(2);
    expect(getAccessToken()).toBeNull();
  });
});
