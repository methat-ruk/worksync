import {
  authResponseSchema,
  currentUserResponseSchema,
  messageResponseSchema,
  type AuthData,
  type LoginInput,
  type SignUpInput
} from "../model/auth-contract";
import {
  API_BASE_URL,
  apiRequest,
  parseApiError,
  setRefreshSessionHandler
} from "@/lib/api/api-client";
import {
  clearAccessToken,
  setAccessToken
} from "@/lib/api/session-token";

let refreshPromise: Promise<AuthData | null> | null = null;

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

export async function refreshSession(): Promise<AuthData | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const response = await apiRequest(
      "/api/auth/refresh",
      { method: "POST" },
      { retryAfterRefresh: false }
    );
    if (response.status === 401) {
      clearAccessToken();
      return null;
    }
    if (!response.ok) {
      throw await parseApiError(response);
    }
    const parsed = authResponseSchema.parse(await response.json());
    setAccessToken(parsed.data.accessToken);
    return parsed.data;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function currentUser() {
  const response = await apiRequest(
    "/api/auth/me",
    {},
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return currentUserResponseSchema.parse(await response.json()).data.user;
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

setRefreshSessionHandler(async () => Boolean(await refreshSession()));
