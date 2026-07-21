import {
  authResponseSchema,
  messageResponseSchema,
  type AuthData,
  type LoginInput,
  type SignUpInput
} from "../model/auth-contract";
import {
  API_BASE_URL,
  ApiError,
  apiRequest,
  parseApiError
} from "@/lib/api/api-client";
import {
  clearAccessToken,
  setAccessToken
} from "@/lib/api/session-token";

export type RefreshSessionOutcome =
  | { kind: "authenticated"; data: AuthData }
  | { kind: "unauthenticated" }
  | { kind: "recoverable-error"; error: unknown };

const REFRESH_CONFLICT_MAX_RETRIES = 2;
const REFRESH_CONFLICT_DEFAULT_DELAY_MS = 1_000;

export function refreshConflictDelayMs(retryAfter: string | null): number {
  if (!retryAfter || !/^\d+$/.test(retryAfter.trim())) {
    return REFRESH_CONFLICT_DEFAULT_DELAY_MS;
  }
  return Math.min(Number(retryAfter.trim()), 1) * 1_000;
}

function isRefreshConcurrencyConflict(error: ApiError): boolean {
  return (
    error.status === 409 &&
    error.body.data?.code === "REFRESH_CONCURRENCY_CONFLICT"
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function authCommand(
  path: string,
  input: LoginInput | SignUpInput
): Promise<AuthData> {
  const response = await apiRequest(path, {
    method: "POST",
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw await parseApiError(response);
  }
  const parsed = authResponseSchema.parse(await response.json());
  setAccessToken(parsed.data.accessToken);
  return parsed.data;
}

export async function login(input: LoginInput): Promise<AuthData> {
  return authCommand("/api/auth/login", input);
}

export async function signUp(input: SignUpInput): Promise<AuthData> {
  return authCommand("/api/auth/signup", input);
}

export async function refreshSession(): Promise<RefreshSessionOutcome> {
  try {
    for (let attempt = 0; ; attempt += 1) {
      const response = await apiRequest(
        "/api/auth/refresh",
        { method: "POST" },
        { retryAfterRefresh: false }
      );
      if (response.status === 401) {
        clearAccessToken();
        return { kind: "unauthenticated" };
      }
      if (!response.ok) {
        const retryAfter = response.headers.get("Retry-After");
        const error = await parseApiError(response);
        if (
          isRefreshConcurrencyConflict(error) &&
          attempt < REFRESH_CONFLICT_MAX_RETRIES
        ) {
          await delay(refreshConflictDelayMs(retryAfter));
          continue;
        }
        throw error;
      }
      const parsed = authResponseSchema.parse(await response.json());
      setAccessToken(parsed.data.accessToken);
      return { kind: "authenticated", data: parsed.data };
    }
  } catch (error: unknown) {
    clearAccessToken();
    return { kind: "recoverable-error", error };
  }
}

export async function logout(): Promise<void> {
  const response = await apiRequest("/api/auth/logout", { method: "POST" });
  if (!response.ok) {
    throw await parseApiError(response);
  }
  messageResponseSchema.parse(await response.json());
  clearAccessToken();
}

export async function logoutAll(): Promise<void> {
  const response = await apiRequest(
    "/api/auth/logout-all",
    { method: "POST" },
    { authenticated: true, retryAfterRefresh: false }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  messageResponseSchema.parse(await response.json());
  clearAccessToken();
}

export function googleLoginUrl(): string {
  return `${API_BASE_URL}/api/auth/google`;
}

export const googleOAuthEnabled =
  process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true";
