import {
  apiErrorSchema,
  authResponseSchema,
  currentUserResponseSchema,
  messageResponseSchema,
  type ApiErrorBody,
  type AuthData,
  type LoginInput,
  type SignUpInput
} from "./auth-contract";

const API_BASE_URL = (() => {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!value) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is required");
  }
  const url = new URL(value);
  return url.origin;
})();

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody
  ) {
    super(body.message);
    this.name = "ApiError";
  }
}

let accessToken: string | null = null;
let refreshPromise: Promise<AuthData | null> | null = null;

async function parseError(response: Response): Promise<ApiError> {
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
  return new ApiError(
    response.status,
    parsed.success
      ? parsed.data
      : { success: false, message: "Request failed" }
  );
}

async function request(
  path: string,
  init: RequestInit = {},
  options: { authenticated?: boolean; retryAfterRefresh?: boolean } = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.authenticated && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });

  if (
    response.status === 401 &&
    options.authenticated &&
    options.retryAfterRefresh !== false
  ) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return request(path, init, {
        authenticated: true,
        retryAfterRefresh: false
      });
    }
  }
  return response;
}

async function authCommand(
  path: string,
  input: LoginInput | SignUpInput
): Promise<AuthData> {
  const response = await request(path, {
    method: "POST",
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const parsed = authResponseSchema.parse(await response.json());
  accessToken = parsed.data.accessToken;
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
    const response = await request(
      "/api/auth/refresh",
      { method: "POST" },
      { retryAfterRefresh: false }
    );
    if (response.status === 401) {
      accessToken = null;
      return null;
    }
    if (!response.ok) {
      throw await parseError(response);
    }
    const parsed = authResponseSchema.parse(await response.json());
    accessToken = parsed.data.accessToken;
    return parsed.data;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function currentUser() {
  const response = await request(
    "/api/auth/me",
    {},
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseError(response);
  }
  return currentUserResponseSchema.parse(await response.json()).data.user;
}

export async function logout(): Promise<void> {
  const response = await request("/api/auth/logout", { method: "POST" });
  if (!response.ok) {
    throw await parseError(response);
  }
  messageResponseSchema.parse(await response.json());
  accessToken = null;
}

export async function logoutAll(): Promise<void> {
  const response = await request(
    "/api/auth/logout-all",
    { method: "POST" },
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseError(response);
  }
  messageResponseSchema.parse(await response.json());
  accessToken = null;
}

export function clearAccessToken(): void {
  accessToken = null;
}

export function googleLoginUrl(): string {
  return `${API_BASE_URL}/api/auth/google`;
}

export const googleOAuthEnabled =
  process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true";
