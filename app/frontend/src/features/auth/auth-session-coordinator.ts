"use client";

const AUTH_SESSION_COORDINATOR_NAME = "worksync-auth-session";
const SESSION_INVALIDATED_MESSAGE = { type: "session-invalidated" } as const;
export const AUTH_SESSION_LOCK_WAIT_TIMEOUT_MS = 10_000;

let channel: BroadcastChannel | null | undefined;
let invalidationHandler: (() => void) | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) {
    return channel;
  }
  if (
    typeof window === "undefined" ||
    typeof BroadcastChannel === "undefined"
  ) {
    channel = null;
    return channel;
  }
  try {
    channel = new BroadcastChannel(AUTH_SESSION_COORDINATOR_NAME);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === SESSION_INVALIDATED_MESSAGE.type
      ) {
        invalidationHandler?.();
      }
    };
  } catch {
    channel = null;
  }
  return channel;
}

export function runAuthSessionOperation<T>(
  operation: () => Promise<T>
): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    return operation();
  }

  const abortController = new AbortController();
  const timeout = globalThis.setTimeout(() => {
    abortController.abort(
      new DOMException(
        "Auth session lock acquisition timed out",
        "TimeoutError"
      )
    );
  }, AUTH_SESSION_LOCK_WAIT_TIMEOUT_MS);

  return navigator.locks
    .request<Promise<T>>(
      AUTH_SESSION_COORDINATOR_NAME,
      { mode: "exclusive", signal: abortController.signal },
      () => {
        globalThis.clearTimeout(timeout);
        return operation();
      }
    )
    .then((result) => result)
    .finally(() => globalThis.clearTimeout(timeout));
}

export function publishSessionInvalidated(): void {
  getChannel()?.postMessage(SESSION_INVALIDATED_MESSAGE);
}

export function setSessionInvalidationHandler(
  handler: (() => void) | null
): void {
  invalidationHandler = handler;
  if (handler) {
    getChannel();
  }
}

export function resetAuthSessionCoordinatorForTests(): void {
  channel?.close();
  channel = undefined;
  invalidationHandler = null;
}
