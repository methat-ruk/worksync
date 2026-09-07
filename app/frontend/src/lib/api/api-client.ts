import { parseApiError } from "./api-error";
import { getAccessToken } from "./session-token";

export { ApiError, parseApiError } from "./api-error";

export const API_BASE_URL = (() => {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!value) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is required");
  }
  const url = new URL(value);
  return url.origin;
})();

type ApiRequestOptions = {
  authenticated?: boolean;
  retryAfterRefresh?: boolean;
};

export type RefreshSessionHandlerOutcome =
  | { kind: "refreshed" }
  | { kind: "unauthenticated" }
  | { kind: "recoverable-error"; error: unknown };

type RefreshSessionHandler = () => Promise<RefreshSessionHandlerOutcome>;

type AuthenticatedRequestOptions<T> = {
  isUnauthorized: (result: T) => boolean;
  signal?: AbortSignal | null;
};

let refreshSessionHandler: RefreshSessionHandler | null = null;

export function setRefreshSessionHandler(
  handler: RefreshSessionHandler | null
): void {
  refreshSessionHandler = handler;
}

function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    throw new DOMException("Request was canceled", "AbortError");
  }
}

export async function runAuthenticatedRequest<T>(
  attempt: (accessToken: string | null) => Promise<T>,
  { isUnauthorized, signal }: AuthenticatedRequestOptions<T>
): Promise<T> {
  throwIfAborted(signal);
  const firstResult = await attempt(getAccessToken());
  if (!isUnauthorized(firstResult) || !refreshSessionHandler) {
    return firstResult;
  }

  throwIfAborted(signal);
  const refreshOutcome = await refreshSessionHandler();
  throwIfAborted(signal);

  if (refreshOutcome.kind === "refreshed") {
    return attempt(getAccessToken());
  }
  if (refreshOutcome.kind === "recoverable-error") {
    throw refreshOutcome.error;
  }
  return firstResult;
}

export async function apiRequest(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {}
): Promise<Response> {
  const attempt = (accessToken: string | null) => {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    return fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: "include"
    });
  };

  if (options.authenticated && options.retryAfterRefresh !== false) {
    return runAuthenticatedRequest(attempt, {
      isUnauthorized: (response) => response.status === 401,
      ...(init.signal ? { signal: init.signal } : {})
    });
  }

  if (options.authenticated) {
    const accessToken = getAccessToken();
    if (accessToken) {
      return attempt(accessToken);
    }
  }
  return attempt(null);
}
