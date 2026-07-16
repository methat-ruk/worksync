import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { status: "loading", user: null } as {
    status: "loading" | "authenticated" | "unauthenticated" | "recoverable-error";
    user: { id: string } | null;
  },
  bootstrapAuth: vi.fn(),
  replace: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ replace: mocks.replace })
}));

vi.mock("./auth-store", () => ({
  bootstrapAuth: mocks.bootstrapAuth,
  useAuth: () => mocks.auth
}));

import { ProtectedRoute, PublicOnlyRoute } from "./auth-guard";

beforeEach(() => {
  mocks.auth = { status: "loading", user: null };
  mocks.bootstrapAuth.mockReset();
  mocks.bootstrapAuth.mockResolvedValue({ status: "loading", user: null });
  mocks.replace.mockReset();
});

describe("auth route guards", () => {
  it("bootstraps public-only routes before rendering their form", async () => {
    render(
      <PublicOnlyRoute>
        <div>Login form</div>
      </PublicOnlyRoute>
    );

    expect(screen.queryByText("Login form")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.bootstrapAuth).toHaveBeenCalledTimes(1));
  });

  it("renders public-only children only after unauthenticated is known", () => {
    mocks.auth = { status: "unauthenticated", user: null };

    render(
      <PublicOnlyRoute>
        <div>Login form</div>
      </PublicOnlyRoute>
    );

    expect(screen.getByText("Login form")).toBeVisible();
    expect(mocks.bootstrapAuth).not.toHaveBeenCalled();
  });

  it("redirects authenticated users away from public-only routes", async () => {
    mocks.auth = { status: "authenticated", user: { id: "user-1" } };

    render(
      <PublicOnlyRoute>
        <div>Login form</div>
      </PublicOnlyRoute>
    );

    expect(screen.queryByText("Login form")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/app"));
  });

  it("shows recovery and retries without rendering public-only children", () => {
    mocks.auth = { status: "recoverable-error", user: null };

    render(
      <PublicOnlyRoute>
        <div>Login form</div>
      </PublicOnlyRoute>
    );

    expect(screen.getByText("We couldn't verify your session.")).toBeVisible();
    expect(screen.queryByText("Login form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.bootstrapAuth).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("redirects protected routes only after unauthenticated is known", async () => {
    mocks.auth = { status: "unauthenticated", user: null };

    render(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>
    );

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/login?next=%2Fapp")
    );
  });

  it("keeps protected routes in recovery without redirecting", () => {
    mocks.auth = { status: "recoverable-error", user: null };

    render(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText("We couldn't verify your session.")).toBeVisible();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
