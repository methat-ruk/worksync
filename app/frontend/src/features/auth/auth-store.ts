"use client";

import { useSyncExternalStore } from "react";

import type { AuthData, PublicUser } from "./auth-contract";
import {
  clearAccessToken,
  login as loginRequest,
  logout as logoutRequest,
  logoutAll as logoutAllRequest,
  refreshSession,
  signUp as signUpRequest
} from "./api-client";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type AuthSnapshot = {
  status: AuthStatus;
  user: PublicUser | null;
};

let snapshot: AuthSnapshot = { status: "loading", user: null };
let bootstrapPromise: Promise<AuthSnapshot> | null = null;
const listeners = new Set<() => void>();

function publish(next: AuthSnapshot): AuthSnapshot {
  snapshot = next;
  listeners.forEach((listener) => listener());
  return snapshot;
}

function authenticated(data: AuthData): AuthSnapshot {
  return publish({ status: "authenticated", user: data.user });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

export function bootstrapAuth(): Promise<AuthSnapshot> {
  if (!bootstrapPromise) {
    bootstrapPromise = refreshSession()
      .then((data) =>
        data
          ? authenticated(data)
          : publish({ status: "unauthenticated", user: null })
      )
      .catch(() =>
        publish({ status: "unauthenticated", user: null })
      );
  }
  return bootstrapPromise;
}

export async function login(
  email: string,
  password: string
): Promise<AuthSnapshot> {
  return authenticated(await loginRequest({ email, password }));
}

export async function signUp(
  displayName: string,
  email: string,
  password: string
): Promise<AuthSnapshot> {
  return authenticated(
    await signUpRequest({ displayName, email, password })
  );
}

export async function refreshAuth(): Promise<AuthSnapshot> {
  const data = await refreshSession();
  return data
    ? authenticated(data)
    : publish({ status: "unauthenticated", user: null });
}

export async function logout(): Promise<void> {
  await logoutRequest();
  publish({ status: "unauthenticated", user: null });
}

export async function logoutAll(): Promise<void> {
  await logoutAllRequest();
  publish({ status: "unauthenticated", user: null });
}

export function clearAuth(): void {
  clearAccessToken();
  publish({ status: "unauthenticated", user: null });
}

export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(subscribe, getAuthSnapshot, getAuthSnapshot);
}

export function resetAuthStoreForTests(): void {
  clearAccessToken();
  bootstrapPromise = null;
  snapshot = { status: "loading", user: null };
  listeners.clear();
}
