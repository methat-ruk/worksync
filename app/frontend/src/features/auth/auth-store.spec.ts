import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
  refreshSession: vi.fn(),
  refreshSessionHandler: undefined as
    | (() => Promise<{ kind: string }>)
    | undefined,
  signUp: vi.fn()
}));

vi.mock("./api/auth-api", () => ({
  login: mocks.login,
  logout: mocks.logout,
  logoutAll: mocks.logoutAll,
  refreshSession: mocks.refreshSession,
  signUp: mocks.signUp
}));

vi.mock("@/lib/api/api-client", () => ({
  setRefreshSessionHandler: (handler: () => Promise<{ kind: string }>) => {
    mocks.refreshSessionHandler = handler;
  }
}));

import {
  bootstrapAuth,
  getAuthSnapshot,
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
});
