"use client";

import { useSyncExternalStore } from "react";

import type { AuthData, PublicUser } from "./model/auth-contract";
import {
  login as loginRequest,
  logout as logoutRequest,
  logoutAll as logoutAllRequest,
  refreshSession,
  signUp as signUpRequest,
  validateCurrentSession,
  type RefreshSessionOutcome
} from "./api/auth-api";
import {
  setRefreshSessionHandler,
  type RefreshSessionHandlerOutcome
} from "@/lib/api/api-client";
import { clearAccessToken, getAccessToken } from "@/lib/api/session-token";
import {
  publishSessionInvalidated,
  resetAuthSessionCoordinatorForTests,
  runAuthSessionOperation,
  setSessionInvalidationHandler
} from "./auth-session-coordinator";

export type AuthSnapshot =
  | { status: "loading"; user: null }
  | { status: "authenticated"; user: PublicUser }
  | { status: "unauthenticated"; user: null }
  | { status: "recoverable-error"; user: null };

type RefreshTransition = {
  outcome: RefreshSessionOutcome;
  snapshot: AuthSnapshot;
};

let snapshot: AuthSnapshot = { status: "loading", user: null };
let refreshTransitionPromise: Promise<RefreshTransition> | null = null;
let invalidationTransitionPromise: Promise<void> | null = null;
let pendingSessionInvalidation = false;
let authGeneration = 0;
const listeners = new Set<() => void>();

function publish(next: AuthSnapshot): AuthSnapshot {
  snapshot = next;
  listeners.forEach((listener) => listener());
  return snapshot;
}

function authenticated(data: AuthData): AuthSnapshot {
  authGeneration += 1;
  return publish({ status: "authenticated", user: data.user });
}

function applyRefreshOutcome(outcome: RefreshSessionOutcome): AuthSnapshot {
  switch (outcome.kind) {
    case "authenticated":
      return authenticated(outcome.data);
    case "unauthenticated":
      publishSessionInvalidated();
      authGeneration += 1;
      return publish({ status: "unauthenticated", user: null });
    case "recoverable-error":
      authGeneration += 1;
      return publish({ status: "recoverable-error", user: null });
  }
}

function runRefreshTransition(): Promise<RefreshTransition> {
  if (!refreshTransitionPromise) {
    refreshTransitionPromise = runAuthSessionOperation(refreshSession)
      .catch(
        (error: unknown): RefreshSessionOutcome => ({
          kind: "recoverable-error",
          error
        })
      )
      .then((outcome) => ({
        outcome,
        snapshot: applyRefreshOutcome(outcome)
      }))
      .finally(() => {
        refreshTransitionPromise = null;
      });
  }
  return refreshTransitionPromise;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

export function bootstrapAuth(): Promise<AuthSnapshot> {
  if (
    snapshot.status === "authenticated" ||
    snapshot.status === "unauthenticated"
  ) {
    return Promise.resolve(snapshot);
  }
  if (snapshot.status === "recoverable-error") {
    publish({ status: "loading", user: null });
  }
  return runRefreshTransition().then((transition) => transition.snapshot);
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
  if (snapshot.status === "recoverable-error") {
    publish({ status: "loading", user: null });
  }
  return (await runRefreshTransition()).snapshot;
}

export async function logout(): Promise<void> {
  await runAuthSessionOperation(logoutRequest);
  authGeneration += 1;
  publish({ status: "unauthenticated", user: null });
  publishSessionInvalidated();
}

export async function logoutAll(): Promise<void> {
  await runAuthSessionOperation(async () => {
    try {
      await logoutAllRequest();
    } catch (error: unknown) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("status" in error) ||
        error.status !== 401
      ) {
        throw error;
      }
      const outcome = await refreshSession();
      applyRefreshOutcome(outcome);
      if (outcome.kind === "authenticated") {
        await logoutAllRequest();
        return;
      }
      if (outcome.kind === "recoverable-error") {
        throw outcome.error;
      }
      throw error;
    }
  });
  authGeneration += 1;
  publish({ status: "unauthenticated", user: null });
  publishSessionInvalidated();
}

export function clearAuth(): void {
  clearAccessToken();
  authGeneration += 1;
  publish({ status: "unauthenticated", user: null });
}

export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(subscribe, getAuthSnapshot, getAuthSnapshot);
}

export function resetAuthStoreForTests(): void {
  clearAccessToken();
  refreshTransitionPromise = null;
  invalidationTransitionPromise = null;
  pendingSessionInvalidation = false;
  authGeneration = 0;
  snapshot = { status: "loading", user: null };
  listeners.clear();
  resetAuthSessionCoordinatorForTests();
  setSessionInvalidationHandler(handleSessionInvalidated);
}

function handleSessionInvalidated(): void {
  if (invalidationTransitionPromise) {
    pendingSessionInvalidation = true;
    return;
  }

  invalidationTransitionPromise = reconcileSessionInvalidation().finally(() => {
    invalidationTransitionPromise = null;
    if (pendingSessionInvalidation) {
      pendingSessionInvalidation = false;
      handleSessionInvalidated();
    }
  });
}

async function reconcileSessionInvalidation(): Promise<void> {
  const accessToken = getAccessToken();
  const authenticatedUser =
    snapshot.status === "authenticated" ? snapshot.user : null;
  const generation = authGeneration;

  if (!accessToken || !authenticatedUser) {
    clearAccessToken();
    authGeneration += 1;
    publish({ status: "unauthenticated", user: null });
    return;
  }

  publish({ status: "loading", user: null });
  const outcome = await validateCurrentSession();

  if (generation !== authGeneration || accessToken !== getAccessToken()) {
    return;
  }

  if (outcome.kind === "active") {
    publish({ status: "authenticated", user: authenticatedUser });
    return;
  }

  clearAccessToken();
  authGeneration += 1;
  publish({
    status:
      outcome.kind === "inactive" ? "unauthenticated" : "recoverable-error",
    user: null
  });
}

setSessionInvalidationHandler(handleSessionInvalidated);

setRefreshSessionHandler(async (): Promise<RefreshSessionHandlerOutcome> => {
  const { outcome } = await runRefreshTransition();
  switch (outcome.kind) {
    case "authenticated":
      return { kind: "refreshed" };
    case "unauthenticated":
      return { kind: "unauthenticated" };
    case "recoverable-error":
      return { kind: "recoverable-error", error: outcome.error };
  }
});
