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

let refreshSessionHandler: RefreshSessionHandler | null = null;

export function setRefreshSessionHandler(
  handler: RefreshSessionHandler | null
): void {
  refreshSessionHandler = handler;
}

export async function apiRequest(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.authenticated) {
    const accessToken = getAccessToken();
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });

  if (
    response.status === 401 &&
    options.authenticated &&
    options.retryAfterRefresh !== false &&
    refreshSessionHandler
  ) {
    const refreshOutcome = await refreshSessionHandler();
    if (refreshOutcome.kind === "refreshed") {
      return apiRequest(path, init, {
        authenticated: true,
        retryAfterRefresh: false
      });
    }
    if (refreshOutcome.kind === "recoverable-error") {
      throw refreshOutcome.error;
    }
  }

  return response;
}
