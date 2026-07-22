import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_SESSION_LOCK_WAIT_TIMEOUT_MS,
  publishSessionInvalidated,
  resetAuthSessionCoordinatorForTests,
  runAuthSessionOperation,
  setSessionInvalidationHandler
} from "./auth-session-coordinator";

afterEach(() => {
  resetAuthSessionCoordinatorForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("auth session coordinator", () => {
  it("runs the operation once when Web Locks is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const operation = vi.fn().mockResolvedValue("done");

    await expect(runAuthSessionOperation(operation)).resolves.toBe("done");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("uses the exclusive cross-tab lock", async () => {
    const request = vi.fn(
      async (_name: string, _options: LockOptions, callback: () => Promise<string>) =>
        callback()
    );
    vi.stubGlobal("navigator", { locks: { request } });
    const operation = vi.fn().mockResolvedValue("done");

    await expect(runAuthSessionOperation(operation)).resolves.toBe("done");
    expect(request).toHaveBeenCalledWith(
      "worksync-auth-session",
      expect.objectContaining({
        mode: "exclusive",
        signal: expect.any(AbortSignal)
      }),
      expect.any(Function)
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("bounds lock acquisition wait without running the operation later", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (
        _name: string,
        options: LockOptions,
        _callback: () => Promise<string>
      ) =>
        new Promise<string>((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => {
            reject(options.signal?.reason);
          });
        })
    );
    vi.stubGlobal("navigator", { locks: { request } });
    const operation = vi.fn().mockResolvedValue("done");

    const result = runAuthSessionOperation(operation);
    const rejection = expect(result).rejects.toMatchObject({
      name: "TimeoutError"
    });
    await vi.advanceTimersByTimeAsync(AUTH_SESSION_LOCK_WAIT_TIMEOUT_MS);

    await rejection;
    expect(operation).not.toHaveBeenCalled();
  });

  it("does not run the operation when lock acquisition rejects", async () => {
    const failure = new Error("lock unavailable");
    vi.stubGlobal("navigator", {
      locks: { request: vi.fn().mockRejectedValue(failure) }
    });
    const operation = vi.fn().mockResolvedValue("done");

    await expect(runAuthSessionOperation(operation)).rejects.toBe(failure);
    expect(operation).not.toHaveBeenCalled();
  });

  it("publishes and receives only the credential-free invalidation event", () => {
    class TestBroadcastChannel {
      static instance: TestBroadcastChannel;
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      postMessage = vi.fn();
      close = vi.fn();

      constructor(public readonly name: string) {
        TestBroadcastChannel.instance = this;
      }
    }
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    const handler = vi.fn();
    setSessionInvalidationHandler(handler);

    publishSessionInvalidated();
    expect(TestBroadcastChannel.instance.name).toBe("worksync-auth-session");
    expect(TestBroadcastChannel.instance.postMessage).toHaveBeenCalledWith({
      type: "session-invalidated"
    });

    TestBroadcastChannel.instance.onmessage?.(
      new MessageEvent("message", {
        data: { type: "session-invalidated" }
      })
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("continues when BroadcastChannel construction fails", () => {
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        constructor() {
          throw new Error("channel unavailable");
        }
      }
    );
    const handler = vi.fn();

    expect(() => setSessionInvalidationHandler(handler)).not.toThrow();
    expect(() => publishSessionInvalidated()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
