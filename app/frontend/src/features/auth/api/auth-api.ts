import {
  authResponseSchema,
  messageResponseSchema,
  type AuthData,
  type LoginInput,
  type SignUpInput
} from "../model/auth-contract";
import {
  API_BASE_URL,
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
      throw await parseApiError(response);
    }
    const parsed = authResponseSchema.parse(await response.json());
    setAccessToken(parsed.data.accessToken);
    return { kind: "authenticated", data: parsed.data };
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
    { authenticated: true }
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
