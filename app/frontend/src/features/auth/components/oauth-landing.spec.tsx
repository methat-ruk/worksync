import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authResult: "google-success" as string | null,
  refreshAuth: vi.fn(),
  router: { replace: vi.fn() }
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => ({
    get: (key: string) => (key === "auth" ? mocks.authResult : null)
  })
}));

vi.mock("../auth-store", () => ({
  refreshAuth: mocks.refreshAuth
}));

import { OAuthLanding } from "./oauth-landing";

beforeEach(() => {
  mocks.authResult = "google-success";
  mocks.refreshAuth.mockReset();
  mocks.router.replace.mockReset();
});

describe("OAuth landing", () => {
  it("finishes a successful callback by replacing the route", async () => {
    mocks.refreshAuth.mockResolvedValue({
      status: "authenticated",
      user: { id: "user-1" }
    });

    render(<OAuthLanding />);

    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith("/app")
    );
    expect(mocks.refreshAuth).toHaveBeenCalledTimes(1);
  });

  it("shows a recoverable state and retries callback completion", async () => {
    mocks.refreshAuth
      .mockResolvedValueOnce({ status: "recoverable-error", user: null })
      .mockResolvedValueOnce({
        status: "authenticated",
        user: { id: "user-1" }
      });

    render(<OAuthLanding />);

    expect(
      await screen.findByText("We couldn't finish signing you in.")
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith("/app")
    );
    expect(mocks.refreshAuth).toHaveBeenCalledTimes(2);
  });

  it("shows a final failure when refresh confirms no session", async () => {
    mocks.refreshAuth.mockResolvedValue({
      status: "unauthenticated",
      user: null
    });

    render(<OAuthLanding />);

    expect(await screen.findByText("Sign-in not completed")).toBeVisible();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("keeps an unexpected completion failure recoverable", async () => {
    mocks.refreshAuth.mockRejectedValue(new Error("Unexpected failure"));

    render(<OAuthLanding />);

    expect(
      await screen.findByText("We couldn't finish signing you in.")
    ).toBeVisible();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("does not refresh for a cancelled callback", () => {
    mocks.authResult = "google-cancelled";

    render(<OAuthLanding />);

    expect(screen.getByText("Google sign-in was cancelled.")).toBeVisible();
    expect(mocks.refreshAuth).not.toHaveBeenCalled();
  });
});
